const prisma = require('../config/prisma');
const axios = require('axios');

const PLAN_AMOUNTS = { GROWTH: 85000, ENTERPRISE: 250000 }; // in Naira
const PLAN_DAYS = 30; // every plan is 30-day billing cycle

// ─── Helper: calculate smart renewal start date ────────────────────────────
// If there are still days left on the current subscription, the new period
// starts AFTER the current one expires — not immediately.
function calcNewDates(currentSub) {
  const now = new Date();
  const currentExpiry = currentSub?.expiryDate ? new Date(currentSub.expiryDate) : null;

  // If current sub is still active and hasn't expired yet, queue renewal from expiry date
  const startDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const expiryDate = new Date(startDate);
  expiryDate.setDate(expiryDate.getDate() + PLAN_DAYS);
  return { startDate, expiryDate };
}

exports.list = async (req, res, next) => {
  try {
    const { role, tenantId } = req.user;
    const where = role === 'SUPER_ADMIN' ? {}
      : { vendor: { oem: { tenantId } } };
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
    // Return the most relevant subscription: active first, then most recent
    const sub = await prisma.subscription.findFirst({
      where: { vendorId: req.params.vendorId },
      orderBy: [{ status: 'asc' }, { expiryDate: 'desc' }],
    });
    const now = new Date();
    const daysLeft = sub ? Math.max(0, Math.ceil((new Date(sub.expiryDate) - now) / 86400000)) : 0;
    res.json({ success: true, data: sub ? { ...sub, daysLeft } : null });
  } catch (err) { next(err); }
};

// ─── Initiate payment (opens Paystack checkout) ────────────────────────────
exports.initiate = async (req, res, next) => {
  try {
    const { vendorId, plan } = req.body;
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { users: { where: { role: 'FLEET_MANAGER' }, take: 1 } },
    });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    // Check existing active subscription for smart renewal messaging
    const currentSub = await prisma.subscription.findFirst({
      where: { vendorId, status: { in: ['ACTIVE', 'TRIAL'] } },
      orderBy: { expiryDate: 'desc' },
    });

    const { startDate, expiryDate } = calcNewDates(currentSub);
    const isRenewal = currentSub && new Date(currentSub.expiryDate) > new Date();
    const amount = PLAN_AMOUNTS[plan] * 100; // Paystack uses kobo
    const email = vendor.users[0]?.email || vendor.contactEmail;

    // Paystack transaction
    const paystackRes = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount,
      metadata: {
        vendorId,
        plan,
        isRenewal,
        currentExpiryDate: currentSub?.expiryDate,
        newStartDate: startDate.toISOString(),
        newExpiryDate: expiryDate.toISOString(),
        custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: plan },
          { display_name: 'Vendor', variable_name: 'vendor', value: vendor.companyName },
          { display_name: isRenewal ? 'Renewal Starts' : 'Active From', variable_name: 'start_date', value: startDate.toISOString().split('T')[0] },
        ],
      },
      callback_url: `${process.env.FRONTEND_URL}/vendor/subscription/verify`,
    }, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });

    await logAction(req, 'SUBSCRIPTION_INITIATED', 'Subscription', vendorId, { plan, isRenewal, newStartDate: startDate });
    res.json({
      success: true,
      data: {
        authorizationUrl: paystackRes.data.data.authorization_url,
        reference: paystackRes.data.data.reference,
        isRenewal,
        currentExpiryDate: currentSub?.expiryDate || null,
        newStartDate: startDate,
        newExpiryDate: expiryDate,
        daysRemaining: currentSub ? Math.max(0, Math.ceil((new Date(currentSub.expiryDate) - Date.now()) / 86400000)) : 0,
      },
    });
  } catch (err) { next(err); }
};

// ─── Verify payment after redirect ────────────────────────────────────────
exports.verify = async (req, res, next) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ success: false, error: 'Reference required' });

    const paystackRes = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });

    const txn = paystackRes.data.data;
    if (txn.status !== 'success') {
      return res.status(400).json({ success: false, error: 'Payment not successful', status: txn.status });
    }

    const { vendorId, plan, newStartDate, newExpiryDate } = txn.metadata || {};
    if (!vendorId || !plan) return res.status(400).json({ success: false, error: 'Missing metadata' });

    const sub = await activateSubscription({
      vendorId, plan,
      startDate: newStartDate ? new Date(newStartDate) : new Date(),
      expiryDate: newExpiryDate ? new Date(newExpiryDate) : new Date(Date.now() + PLAN_DAYS * 86400000),
      paystackAuthCode: txn.authorization?.authorization_code,
      paystackEmail: txn.customer?.email,
      reference,
    });

    res.json({ success: true, data: sub });
  } catch (err) { next(err); }
};

// ─── Core: activate or queue subscription ─────────────────────────────────
async function activateSubscription({ vendorId, plan, startDate, expiryDate, paystackAuthCode, paystackEmail, reference }) {
  const now = new Date();
  const isImmediate = startDate <= now;

  // Expire any old trials
  await prisma.subscription.updateMany({
    where: { vendorId, status: 'TRIAL' },
    data: { status: 'EXPIRED' },
  });

  // If there's still an active sub and new one starts in the future, mark old as NOT renewing
  if (!isImmediate) {
    await prisma.subscription.updateMany({
      where: { vendorId, status: 'ACTIVE' },
      data: { autoRenew: false }, // will naturally expire; new one queued
    });
  } else {
    // Immediate activation — expire any current active subs
    await prisma.subscription.updateMany({
      where: { vendorId, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
  }

  const sub = await prisma.subscription.create({
    data: {
      vendorId, plan,
      startDate,
      expiryDate,
      status: isImmediate ? 'ACTIVE' : 'ACTIVE', // queued start still created as ACTIVE; scheduler handles it
      autoRenew: true,
      paystackAuthCode: paystackAuthCode || null,
      paystackEmail: paystackEmail || null,
      warningAt7Days: false,
      warningAt3Days: false,
    },
    include: { vendor: { select: { companyName: true, contactEmail: true } } },
  });

  // Ensure vendor is marked active
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: 'ACTIVE' } });

  // Send confirmation email
  const users = await prisma.user.findMany({ where: { vendorId, role: 'FLEET_MANAGER', active: true } });
  for (const u of users) {
    sendEmail({
      to: u.email,
      subject: `✅ FleetAnchor Pro — ${plan} Plan ${isImmediate ? 'Activated' : 'Renewal Queued'}`,
      html: `
        <h2>Your ${plan} plan is ${isImmediate ? 'now active' : 'queued for renewal'}!</h2>
        <p><strong>Company:</strong> ${sub.vendor.companyName}</p>
        <p><strong>Plan:</strong> ${plan}</p>
        <p><strong>${isImmediate ? 'Active from' : 'Starts'}:</strong> ${startDate.toDateString()}</p>
        <p><strong>Expires:</strong> ${expiryDate.toDateString()}</p>
        ${!isImmediate ? `<p>Your current subscription remains active until <strong>${startDate.toDateString()}</strong>, then your new ${plan} plan begins automatically.</p>` : ''}
        <p>Thank you for subscribing to FleetAnchor Pro!</p>
      `,
    }).catch(() => {});
  }

  logger.info(`[SUBSCRIPTION] ${isImmediate ? 'Activated' : 'Renewal queued'} for vendor ${vendorId} — ${plan} from ${startDate.toDateString()} to ${expiryDate.toDateString()}`);
  return sub;
}

exports.activateSubscription = activateSubscription;

exports.cancel = async (req, res, next) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    if (sub.paystackSubCode) {
      await axios.post('https://api.paystack.co/subscription/disable', {
        code: sub.paystackSubCode,
        token: sub.paystackEmail,
      }, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }).catch(() => {});
    }

    await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', autoRenew: false, cancelledAt: new Date() },
    });
    await logAction(req, 'SUBSCRIPTION_CANCELLED', 'Subscription', req.params.id);
    res.json({ success: true, message: 'Subscription cancelled. Access continues until expiry date.' });
  } catch (err) { next(err); }
};

// ─── Super Admin: extend plan without payment ─────────────────────────────
exports.extend = async (req, res, next) => {
  try {
    const { vendorId, days, plan } = req.body;
    const currentSub = await prisma.subscription.findFirst({
      where: { vendorId, status: { in: ['ACTIVE', 'TRIAL'] } },
      orderBy: { expiryDate: 'desc' },
    });

    const baseDate = currentSub?.expiryDate && new Date(currentSub.expiryDate) > new Date()
      ? new Date(currentSub.expiryDate) // extend from current expiry
      : new Date(); // no active sub — start now

    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + parseInt(days));

    if (currentSub) {
      await prisma.subscription.update({
        where: { id: currentSub.id },
        data: {
          expiryDate: newExpiry,
          plan: plan || currentSub.plan,
          status: 'ACTIVE',
          warningAt7Days: false,
          warningAt3Days: false,
        },
      });
    } else {
      await prisma.subscription.create({
        data: { vendorId, plan: plan || 'GROWTH', startDate: new Date(), expiryDate: newExpiry, status: 'ACTIVE' },
      });
    }

    await prisma.vendor.update({ where: { id: vendorId }, data: { status: 'ACTIVE' } });
    await logAction(req, 'SUBSCRIPTION_EXTENDED', 'Subscription', vendorId, { days, plan, newExpiry });
    res.json({ success: true, message: `Plan extended by ${days} days. New expiry: ${newExpiry.toDateString()}` });
  } catch (err) { next(err); }
};

// ─── Super Admin: demo mode toggle ────────────────────────────────────────
exports.toggleDemo = async (req, res, next) => {
  try {
    const { vendorId, enabled } = req.body;
    await prisma.vendor.update({ where: { id: vendorId }, data: { demoMode: enabled } });
    await logAction(req, 'DEMO_MODE_TOGGLED', 'Vendor', vendorId, { enabled });
    res.json({ success: true, message: `Demo mode ${enabled ? 'enabled' : 'disabled'} for vendor` });
  } catch (err) { next(err); }
};
