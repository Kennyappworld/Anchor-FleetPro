const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const prisma = new PrismaClient();
const axios = require('axios');

const PLAN_AMOUNTS = { GROWTH: 85000, ENTERPRISE: 250000 };

exports.list = async (req, res, next) => {
  try {
    const { role, tenantId } = req.user;
    const where = role === 'SUPER_ADMIN' ? {}
      : { vendor: { oemCompany: { tenantId } } };
    const subs = await prisma.subscription.findMany({
      where,
      include: { vendor: { select: { companyName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: subs });
  } catch (err) { next(err); }
};

exports.getForVendor = async (req, res, next) => {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { vendorId: req.params.vendorId, status: 'ACTIVE' },
    });
    res.json({ success: true, data: sub });
  } catch (err) { next(err); }
};

exports.initiate = async (req, res, next) => {
  try {
    const { vendorId, plan } = req.body;
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { users: { where: { role: 'FLEET_MANAGER' }, take: 1 } },
    });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const amount = PLAN_AMOUNTS[plan] * 100; // Paystack uses kobo
    const email = vendor.users[0]?.email || vendor.email;

    // Create Paystack transaction
    const paystackRes = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount,
      metadata: { vendorId, plan, custom_fields: [{ display_name: 'Plan', variable_name: 'plan', value: plan }] },
      callback_url: `${process.env.FRONTEND_URL}/subscription/verify`,
    }, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });

    await logAction(req, 'SUBSCRIPTION_INITIATED', 'Subscription', vendorId, { plan });
    res.json({ success: true, data: { authorizationUrl: paystackRes.data.data.authorization_url, reference: paystackRes.data.data.reference } });
  } catch (err) { next(err); }
};

exports.cancel = async (req, res, next) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    if (sub.paystackSubCode) {
      await axios.post(`https://api.paystack.co/subscription/disable`, {
        code: sub.paystackSubCode,
        token: sub.paystackEmailToken,
      }, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
    }

    await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await logAction(req, 'SUBSCRIPTION_CANCELLED', 'Subscription', req.params.id);
    res.json({ success: true, message: 'Subscription cancelled' });
  } catch (err) { next(err); }
};
