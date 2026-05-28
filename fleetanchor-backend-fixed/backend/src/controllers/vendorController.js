const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const { sendEmail } = require('../services/emailService');
const crypto = require('crypto');
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
    const { companyName, contactEmail, contactPhone, oemId, address, contactPerson, plan } = req.body;
    const email = contactEmail || req.body.email;

    // Generate invite token + trial
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Generate a readable temporary password
    const tempPassword = 'Fleet@' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const vendor = await prisma.vendor.create({
      data: {
        companyName, contactEmail: email, contactPhone,
        oemId, address: address || null,
        status: 'ACTIVE',
        inviteToken, inviteExpiry,
        trialEndsAt, trialPlan: plan || 'GROWTH',
        inviteAccepted: true, // account created directly — no setup page needed
      },
      include: { oem: { select: { name: true } } },
    });

    // Auto-create Fleet Manager account
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.create({
      data: {
        fullName: contactPerson || companyName,
        email,
        passwordHash,
        role: 'FLEET_MANAGER',
        vendorId: vendor.id,
        oemId,
        active: true,
        mustChangePassword: true, // force password change on first login
      },
    });

    // Send welcome email with full login details
    const frontendUrl = process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app';
    const loginUrl = `${frontendUrl}/login`;

    sendEmail({
      to: email,
      subject: `Welcome to FleetAnchor Pro — Your login details for ${companyName}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto">
          <div style="background:#0A1628;padding:24px 28px;border-radius:12px 12px 0 0;text-align:center">
            <div style="font-size:22px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
            <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:1px">MAINTENANCE MANAGEMENT PLATFORM</div>
          </div>
          <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <h2 style="color:#0A1628;margin-top:0">Welcome, ${contactPerson || companyName}! 🎉</h2>
            <p>Your FleetAnchor Pro account for <strong>${companyName}</strong> has been created by <strong>${vendor.oem?.name || 'your OEM'}</strong>.</p>
            <p>You are on a <strong>30-day free trial</strong> of the ${plan || 'GROWTH'} plan — no payment needed yet.</p>

            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:20px;margin:20px 0">
              <p style="margin:0 0 12px;font-weight:700;color:#0A1628;font-size:13px">🔐 Your Login Details</p>
              <table style="width:100%;font-size:13px">
                <tr><td style="color:#666;padding:6px 0;width:40%">Login URL</td><td><a href="${loginUrl}" style="color:#1155CC;font-weight:600">${loginUrl}</a></td></tr>
                <tr><td style="color:#666;padding:6px 0">Email / Username</td><td style="font-weight:600">${email}</td></tr>
                <tr><td style="color:#666;padding:6px 0">Temporary Password</td><td><strong style="background:#FFF3DC;padding:3px 8px;border-radius:4px;letter-spacing:1px">${tempPassword}</strong></td></tr>
                <tr><td style="color:#666;padding:6px 0">Plan</td><td><strong>${plan || 'GROWTH'} — 30-day free trial</strong></td></tr>
              </table>
            </div>

            <div style="background:#FEF3CD;border:1px solid #F5A623;border-radius:8px;padding:12px 16px;margin:16px 0">
              <p style="margin:0;font-size:12px;color:#7D4E00">⚠️ <strong>Important:</strong> You will be asked to change this temporary password when you first log in. Please keep these details safe until then.</p>
            </div>

            <p style="font-size:13px">Once logged in, you can:</p>
            <ul style="font-size:13px;color:#444;line-height:1.8">
              <li>Add your fleet vehicles (or import from Excel)</li>
              <li>Create up to <strong>2 team members</strong> on your plan</li>
              <li>Submit and track maintenance job requests</li>
              <li>View maintenance history and invoices</li>
            </ul>

            <div style="text-align:center;margin:24px 0">
              <a href="${loginUrl}" style="background:#F5A623;color:#000;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block">
                Log In Now →
              </a>
            </div>

            <p style="font-size:11px;color:#999;text-align:center">If you did not expect this email, contact ${vendor.oem?.name || 'your OEM administrator'}.</p>
          </div>
        </div>
      `,
    }).catch(() => {});

    await logAction(req, 'VENDOR_CREATED', 'Vendor', vendor.id);
    res.status(201).json({
      success: true,
      data: vendor,
      loginDetails: {
        loginUrl,
        email,
        tempPassword,
        message: 'Fleet Manager account created. Login details sent to vendor email.',
      },
    });
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

exports.remove = async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true, vehicles: true, subscriptions: true } } },
    });
    if (!vendor) return res.status(404).json({ success: false, error: 'Vendor not found' });

    // Delete in order: subscriptions, users, vehicles, then vendor
    await prisma.subscription.deleteMany({ where: { vendorId: vendor.id } });
    await prisma.user.deleteMany({ where: { vendorId: vendor.id } });
    // Detach vehicles (preserve job history) rather than hard delete
    await prisma.vehicle.updateMany({ where: { vendorId: vendor.id }, data: { status: 'DECOMMISSIONED' } });
    await prisma.vendor.delete({ where: { id: vendor.id } });

    await logAction(req, 'VENDOR_DELETED', 'Vendor', vendor.id, {
      companyName: vendor.companyName,
      usersRemoved: vendor._count.users,
    });
    res.json({ success: true, message: `Vendor "${vendor.companyName}" deleted permanently.` });
  } catch (err) { next(err); }
};
