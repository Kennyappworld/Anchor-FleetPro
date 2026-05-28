const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { logAction } = require('../services/auditService');
const { sendEmail } = require('../services/emailService');
const prisma = new PrismaClient();

const GROWTH_USER_LIMIT = 2;

function tenantFilter(req) {
  const { role, vendorId, tenantId } = req.user;
  if (role === 'SUPER_ADMIN') return {};
  if (['OEM_ADMIN','WORKSHOP_STAFF'].includes(role)) return { vendor: { oem: { tenantId } } };
  return { vendorId };
}

exports.me = async (req, res) => {
  res.json({ success: true, data: req.user });
};

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, role } = req.query;
    const where = { ...tenantFilter(req), ...(role ? { role } : {}), active: true };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip: (page - 1) * limit, take: +limit,
        select: { id: true, fullName: true, email: true, role: true, active: true, createdAt: true, vendor: { select: { companyName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: users, total, page: +page });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      select: { id: true, fullName: true, email: true, role: true, active: true, createdAt: true, vendor: { select: { companyName: true } } },
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { fullName, email, role, vendorId } = req.body;

    // Determine which vendor this user belongs to
    const vid = req.user.role === 'FLEET_MANAGER' ? req.user.vendorId : (vendorId || req.user.vendorId);

    // Enforce Growth plan user cap for vendor-level users
    if (vid && ['FLEET_MANAGER','MAINTENANCE_SUPERVISOR','FIELD_AGENT'].includes(role)) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vid },
        include: { subscriptions: { where: { status: 'ACTIVE' }, take: 1 }, _count: { select: { users: true } } },
      });
      const plan = vendor?.subscriptions[0]?.plan || 'NONE';
      if (plan !== 'ENTERPRISE' && vendor._count.users >= GROWTH_USER_LIMIT) {
        return res.status(403).json({ success: false, error: `Growth plan allows ${GROWTH_USER_LIMIT} users. Upgrade to Enterprise.` });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    // Generate temp password
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: { fullName, email, passwordHash, role, vendorId: vid, active: true },
      select: { id: true, fullName: true, email: true, role: true },
    });

    await sendEmail(email, 'welcome', { name: fullName, email, tempPassword });
    await logAction(req, 'USER_CREATED', 'User', user.id, { role });
    res.status(201).json({ success: true, data: user, message: 'User created — welcome email sent with temporary password' });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const allowed = ['fullName','role'];
    // Users can update their own name; admins can also change role
    if (req.params.id !== req.user.id) {
      requireRole(['SUPER_ADMIN','OEM_ADMIN','FLEET_MANAGER'])(req, {}, () => {});
    }
    const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: { id: true, fullName: true, email: true, role: true } });
    await logAction(req, 'USER_UPDATED', 'User', req.params.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

exports.suspend = async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
    await logAction(req, 'USER_SUSPENDED', 'User', req.params.id);
    res.json({ success: true, message: 'User suspended' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false, email: `deleted_${Date.now()}_${req.params.id}@fleetanchor.deleted` } });
    await logAction(req, 'USER_DELETED', 'User', req.params.id);
    res.json({ success: true, message: 'User removed' });
  } catch (err) { next(err); }
};
