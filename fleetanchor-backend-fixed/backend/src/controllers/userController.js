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

    // Generate readable temp password
    const tempPassword = 'Team@' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const loginUrl = `${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/login`;

    const vendor = vid ? await prisma.vendor.findUnique({ where: { id: vid }, select: { companyName: true } }) : null;

    const user = await prisma.user.create({
      data: { fullName, email, passwordHash, role, vendorId: vid, oemId: req.user.oemId, active: true, mustChangePassword: true },
      select: { id: true, fullName: true, email: true, role: true },
    });

    // Send branded welcome email with full login details
    sendEmail({
      to: email,
      subject: `You've been added to FleetAnchor Pro — ${vendor?.companyName || 'Your Fleet'}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <div style="font-size:20px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
          </div>
          <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px">
            <h2 style="color:#0A1628">Hello ${fullName}! 👋</h2>
            <p>You've been added to the <strong>${vendor?.companyName || 'fleet'}</strong> team on FleetAnchor Pro as a <strong>${role.replace(/_/g,' ')}</strong>.</p>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:20px 0">
              <p style="margin:0 0 12px;font-weight:700;color:#0A1628">🔐 Your Login Details</p>
              <table style="width:100%;font-size:13px">
                <tr><td style="color:#666;padding:6px 0;width:40%">Login URL</td><td><a href="${loginUrl}" style="color:#1155CC">${loginUrl}</a></td></tr>
                <tr><td style="color:#666;padding:6px 0">Email</td><td><strong>${email}</strong></td></tr>
                <tr><td style="color:#666;padding:6px 0">Temporary Password</td><td><strong style="background:#FFF3DC;padding:3px 8px;border-radius:4px;letter-spacing:1px">${tempPassword}</strong></td></tr>
              </table>
            </div>
            <div style="background:#FEF3CD;border:1px solid #F5A623;border-radius:8px;padding:12px;margin:16px 0">
              <p style="margin:0;font-size:12px;color:#7D4E00">⚠️ You will be asked to change this temporary password when you first log in.</p>
            </div>
            <div style="text-align:center;margin-top:20px">
              <a href="${loginUrl}" style="background:#F5A623;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Log In Now →</a>
            </div>
          </div>
        </div>
      `,
    }).catch(() => {});

    await logAction(req, 'USER_CREATED', 'User', user.id, { role });
    res.status(201).json({
      success: true,
      data: { user, tempPassword, loginUrl },
      message: 'User created — login details sent to their email',
    });
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

exports.resendCredentials = async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      include: { vendor: { select: { companyName: true } } },
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Generate a fresh temp password
    const tempPassword = 'Team@' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const loginUrl = `${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/login`;

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true },
    });

    await sendEmail({
      to: user.email,
      subject: 'FleetAnchor Pro — Your Login Details',
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <div style="font-size:20px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
          </div>
          <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px">
            <h2 style="color:#0A1628">Hi ${user.fullName},</h2>
            <p>Your login details for FleetAnchor Pro have been reset. Use the details below to log in:</p>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:20px 0">
              <table style="width:100%;font-size:13px">
                <tr><td style="color:#666;padding:6px 0;width:40%">Login URL</td><td><a href="${loginUrl}" style="color:#1155CC">${loginUrl}</a></td></tr>
                <tr><td style="color:#666;padding:6px 0">Email</td><td><strong>${user.email}</strong></td></tr>
                <tr><td style="color:#666;padding:6px 0">New Temp Password</td><td><strong style="background:#FFF3DC;padding:3px 8px;border-radius:4px;letter-spacing:1px">${tempPassword}</strong></td></tr>
              </table>
            </div>
            <div style="text-align:center;margin-top:20px">
              <a href="${loginUrl}" style="background:#F5A623;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Log In Now →</a>
            </div>
          </div>
        </div>
      `,
    });

    await logAction(req, 'CREDENTIALS_RESENT', 'User', user.id);
    res.json({ success: true, message: 'New login details sent to their email' });
  } catch (err) { next(err); }
};
