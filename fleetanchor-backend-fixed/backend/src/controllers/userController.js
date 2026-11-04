const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { sendEmail } = require('../services/emailService');
const { logAction } = require('../services/auditService');
const { escHtml } = require('../utils/sanitize');
const { userWhere, resolveVendorId, outranks, isSuper } = require('../utils/tenant');

const GROWTH_USER_LIMIT = 2;
const tenantFilter = (req) => userWhere(req.user);

// Finds a user the caller is allowed to act on: same fleet / OEM and lower rank.
async function findManageable(req) {
  const target = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null, ...tenantFilter(req) } });
  if (!target) return { status: 404, error: 'User not found' };
  if (target.id === req.user.userId) return { status: 400, error: 'You cannot do this to your own account' };
  if (!outranks(req.user.role, target.role)) return { status: 403, error: 'Insufficient authority for this user' };
  return { target };
}

exports.me = async (req, res) => {
  res.json({ success: true, data: req.user });
};

// Roles each role may hand out (never its own rank or higher).
const ASSIGNABLE = {
  SUPER_ADMIN: ['OEM_ADMIN', 'WORKSHOP_STAFF', 'FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT', 'DRIVER'],
  OEM_ADMIN: ['WORKSHOP_STAFF', 'FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT', 'DRIVER'],
  FLEET_MANAGER: ['MAINTENANCE_SUPERVISOR', 'FIELD_AGENT', 'DRIVER'],
};

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, role } = req.query;
    const where = { ...tenantFilter(req), ...(role ? { role } : {}), active: true };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip: (Math.max(parseInt(page) || 1, 1) - 1) * Math.min(Math.max(parseInt(limit) || 50, 1), 100), take: Math.min(Math.max(parseInt(limit) || 50, 1), 100),
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

    if (!(ASSIGNABLE[req.user.role] || []).includes(role)) {
      return res.status(403).json({ success: false, error: 'You cannot create users with that role' });
    }

    // Workshop-side users belong to the OEM; fleet-side users to a vendor the caller controls.
    const workshopRole = ['OEM_ADMIN', 'WORKSHOP_STAFF'].includes(role);
    let vid = null;
    if (!workshopRole) {
      vid = await resolveVendorId(req.user, vendorId);
      if (!vid) return res.status(403).json({ success: false, error: 'You cannot add users to that fleet' });
    }

    // Enforce Growth plan user cap for vendor-level users
    if (vid && ['FLEET_MANAGER','MAINTENANCE_SUPERVISOR','FIELD_AGENT'].includes(role)) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vid },
        include: { subscriptions: { where: { status: 'ACTIVE' }, take: 1 }, _count: { select: { users: true } } },
      });
      const plan = vendor?.subscriptions?.[0]?.plan || 'NONE';
      if (plan !== 'ENTERPRISE' && (vendor?._count?.users || 0) >= GROWTH_USER_LIMIT) {
        return res.status(403).json({ success: false, error: `Growth plan allows ${GROWTH_USER_LIMIT} users. Upgrade to Enterprise.` });
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    // Generate readable temp password
    const tempPassword = 'Team@' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const loginUrl = `${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/login`;

    const vendor = vid ? await prisma.vendor.findUnique({ where: { id: vid }, select: { companyName: true } }) : null;

    const user = await prisma.user.create({
      data: { fullName, email, passwordHash, role, vendorId: vid, oemId: isSuper(req.user) ? (req.body.oemId || null) : req.user.oemId, active: true, mustChangePassword: true },
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
            <h2 style="color:#0A1628">Hello ${escHtml(fullName)}! 👋</h2>
            <p>You've been added to the <strong>${escHtml(vendor?.companyName || 'fleet')}</strong> team on FleetAnchor Pro as a <strong>${role.replace(/_/g,' ')}</strong>.</p>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:20px 0">
              <p style="margin:0 0 12px;font-weight:700;color:#0A1628">🔐 Your Login Details</p>
              <table style="width:100%;font-size:13px">
                <tr><td style="color:#666;padding:6px 0;width:40%">Login URL</td><td><a href="${loginUrl}" style="color:#1155CC">${loginUrl}</a></td></tr>
                <tr><td style="color:#666;padding:6px 0">Email</td><td><strong>${escHtml(email)}</strong></td></tr>
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
      data: { user, tempPassword, loginUrl }, // shown once to the manager in case the email does not arrive
      message: 'User created — login details sent to their email',
    });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    // Previously the role check here did nothing, so any signed-in user could
    // make themselves (or anyone) SUPER_ADMIN. Now: you may rename yourself;
    // changing anyone else, or any role, needs authority over that user.
    const data = {};
    if (typeof req.body.fullName === 'string' && req.body.fullName.trim().length >= 2) data.fullName = req.body.fullName.trim().slice(0, 120);

    if (req.params.id === req.user.userId) {
      if (req.body.role !== undefined) return res.status(403).json({ success: false, error: 'You cannot change your own role' });
    } else {
      const found = await findManageable(req);
      if (found.error) return res.status(found.status).json({ success: false, error: found.error });
      if (req.body.role !== undefined) {
        if (!(ASSIGNABLE[req.user.role] || []).includes(req.body.role)) {
          return res.status(403).json({ success: false, error: 'You cannot assign that role' });
        }
        data.role = req.body.role;
      }
    }
    if (!Object.keys(data).length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    const user = await prisma.user.update({ where: { id: req.params.id }, data, select: { id: true, fullName: true, email: true, role: true } });
    await logAction(req, 'USER_UPDATED', 'User', req.params.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

exports.suspend = async (req, res, next) => {
  try {
    const found = await findManageable(req);
    if (found.error) return res.status(found.status).json({ success: false, error: found.error });
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
    await logAction(req, 'USER_SUSPENDED', 'User', req.params.id);
    res.json({ success: true, message: 'User suspended' });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const found = await findManageable(req);
    if (found.error) return res.status(found.status).json({ success: false, error: found.error });
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false, deletedAt: new Date(), email: `deleted_${Date.now()}_${req.params.id}@fleetanchor.deleted` } });
    await logAction(req, 'USER_DELETED', 'User', req.params.id);
    res.json({ success: true, message: 'User removed' });
  } catch (err) { next(err); }
};

exports.resendCredentials = async (req, res, next) => {
  try {
    const found = await findManageable(req);
    if (found.error) return res.status(found.status).json({ success: false, error: found.error });
    const user = found.target;

    // Generate a fresh temp password
    const tempPassword = 'Team@' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const loginUrl = `${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/login`;

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: true, lastPasswordChange: new Date() },
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
            <h2 style="color:#0A1628">Hi ${escHtml(user.fullName)},</h2>
            <p>Your login details for FleetAnchor Pro have been reset. Use the details below to log in:</p>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:20px 0">
              <table style="width:100%;font-size:13px">
                <tr><td style="color:#666;padding:6px 0;width:40%">Login URL</td><td><a href="${loginUrl}" style="color:#1155CC">${loginUrl}</a></td></tr>
                <tr><td style="color:#666;padding:6px 0">Email</td><td><strong>${escHtml(user.email)}</strong></td></tr>
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
