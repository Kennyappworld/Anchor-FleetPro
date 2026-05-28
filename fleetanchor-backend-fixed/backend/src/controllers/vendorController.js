const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const { sendEmail } = require('../services/emailService');
const prisma = new PrismaClient();

function tenantFilter(req) {
  const { role, tenantId } = req.user;
  if (role === 'SUPER_ADMIN') return {};
  return { oem: { tenantId } };
}

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const where = { ...tenantFilter(req), ...(status ? { status } : {}) };
    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where, skip: (page - 1) * limit, take: +limit,
        include: {
          oemCompany: { select: { name: true } },
          subscriptions: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { vehicles: true, users: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vendor.count({ where }),
    ]);
    res.json({ success: true, data: vendors, total, page: +page });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      include: {
        oemCompany: true,
        users: { select: { id: true, fullName: true, email: true, role: true, active: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { vehicles: true } },
      },
    });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });
    res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
};

exports.stats = async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id, ...tenantFilter(req) } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const [vehicles, jobs, invoices] = await Promise.all([
      prisma.vehicle.count({ where: { vendorId: req.params.id } }),
      prisma.jobRequest.count({ where: { vehicle: { vendorId: req.params.id } } }),
      prisma.invoice.aggregate({
        where: { jobRequest: { vehicle: { vendorId: req.params.id } }, paymentConfirmed: true },
        _sum: { totalAmount: true },
      }),
    ]);

    res.json({ success: true, data: { vehicles, jobs, totalSpend: invoices._sum.totalAmount || 0 } });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { companyName, email, contactPhone, oemId } = req.body;
    const vendor = await prisma.vendor.create({
      data: { companyName, email, contactPhone, oemId, status: 'ACTIVE' },
    });
    await logAction(req, 'VENDOR_CREATED', 'Vendor', vendor.id);
    res.status(201).json({ success: true, data: vendor });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const allowed = ['companyName','email','contactPhone','address'];
    const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const updated = await prisma.vendor.update({ where: { id: req.params.id }, data });
    await logAction(req, 'VENDOR_UPDATED', 'Vendor', req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

exports.suspend = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: reason },
      include: { users: { select: { email: true, fullName: true }, take: 1 } },
    });
    // Notify primary contact
    if (vendor.users[0]) {
      await sendEmail(vendor.users[0].email, 'accountSuspended', {
        name: vendor.users[0].fullName,
        vendorName: vendor.companyName,
        reason,
      });
    }
    await logAction(req, 'VENDOR_SUSPENDED', 'Vendor', req.params.id, { reason });
    res.json({ success: true, message: 'Vendor suspended' });
  } catch (err) { next(err); }
};

exports.reinstate = async (req, res, next) => {
  try {
    await prisma.vendor.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', suspendedAt: null, suspensionReason: null },
    });
    await logAction(req, 'VENDOR_REINSTATED', 'Vendor', req.params.id);
    res.json({ success: true, message: 'Vendor reinstated' });
  } catch (err) { next(err); }
};
