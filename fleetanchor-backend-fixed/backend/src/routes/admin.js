const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const prisma = new PrismaClient();

router.use(authenticate, requireRole(['SUPER_ADMIN']));

// GET /api/admin/tenants
router.get('/tenants', async (req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        oemCompanies: { include: { _count: { select: { vendors: true } } } },
        _count: { select: { oemCompanies: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: tenants });
  } catch (err) { next(err); }
});

// POST /api/admin/tenants
router.post('/tenants', async (req, res, next) => {
  try {
    const { name, slug, oemName, oemEmail } = req.body;
    const tenant = await prisma.tenant.create({
      data: {
        name, slug: slug.toLowerCase().replace(/\s+/g, '-'),
        oemCompanies: { create: { name: oemName, contactEmail: oemEmail, planTier: 'ENTERPRISE' } },
      },
      include: { oemCompanies: true },
    });
    await logAction(req, 'TENANT_CREATED', 'Tenant', tenant.id);
    res.status(201).json({ success: true, data: tenant });
  } catch (err) { next(err); }
});

// GET /api/admin/overview
router.get('/overview', async (req, res, next) => {
  try {
    const [tenants, vendors, vehicles, jobs, revenue] = await Promise.all([
      prisma.tenant.count(),
      prisma.vendor.count(),
      prisma.vehicle.count(),
      prisma.jobRequest.count(),
      prisma.invoice.aggregate({ where: { paymentConfirmed: true }, _sum: { totalAmount: true } }),
    ]);
    res.json({ success: true, data: { tenants, vendors, vehicles, jobs, totalRevenue: revenue._sum.totalAmount || 0 } });
  } catch (err) { next(err); }
});

// GET /api/admin/activity
router.get('/activity', async (req, res, next) => {
  try {
    const { limit = 100, hideCost = false } = req.query;
    const logs = await prisma.auditLog.findMany({
      take: +limit,
      include: { user: { select: { fullName: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: logs, costHidden: hideCost === 'true' });
  } catch (err) { next(err); }
});

// POST /api/admin/tenants/:id/deactivate
router.post('/tenants/:id/deactivate', async (req, res, next) => {
  try {
    await prisma.tenant.update({ where: { id: req.params.id }, data: { active: false } });
    await logAction(req, 'TENANT_DEACTIVATED', 'Tenant', req.params.id);
    res.json({ success: true, message: 'Tenant deactivated' });
  } catch (err) { next(err); }
});

// POST /api/admin/backup/run — Super Admin manually triggers Google Drive backup
router.post('/backup/run', requireRole(['SUPER_ADMIN']), async (req, res) => {
  const { triggerManualBackup } = require('../services/googleDriveBackup');
  return triggerManualBackup(req, res);
});

// GET /api/admin/backup/status — check if backup is configured
router.get('/backup/status', requireRole(['SUPER_ADMIN']), (req, res) => {
  res.json({
    success: true,
    configured: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
    hasFolderId: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
    schedule: 'Every Sunday at 2:00 AM WAT',
    notifyEmail: process.env.BACKUP_NOTIFY_EMAIL || process.env.SENDGRID_FROM_EMAIL || null,
  });
});

module.exports = router;

// POST /api/admin/test-email — Super Admin sends test email
router.post('/test-email', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { sendEmail } = require('../services/emailService');
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, error: 'Email address required' });

    await sendEmail({
      to,
      subject: '✅ FleetAnchor Pro — Email Delivery Test',
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto">
          <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
            <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:1px">EMAIL DELIVERY TEST</div>
          </div>
          <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <h2 style="color:#1A6A3A;margin-top:0">✅ Email is working!</h2>
            <p style="color:#333">This is a test email from your <strong>FleetAnchor Pro</strong> platform.</p>
            <p style="color:#333">If you received this, your email configuration is correctly set up and all transactional emails (vendor invites, job updates, subscription confirmations, backup reports) will be delivered successfully.</p>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px;font-weight:700;color:#0A1628;font-size:13px">📊 System Status</p>
              <table style="width:100%;font-size:12px">
                <tr><td style="color:#666;padding:4px 0;width:40%">Sent at</td><td style="font-weight:600">${new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT</td></tr>
                <tr><td style="color:#666;padding:4px 0">Platform</td><td style="font-weight:600">FleetAnchor Pro (anchor-fleet-pro.vercel.app)</td></tr>
                <tr><td style="color:#666;padding:4px 0">Sent by</td><td style="font-weight:600">Super Admin</td></tr>
                <tr><td style="color:#666;padding:4px 0">Email provider</td><td style="font-weight:600">SendGrid SMTP</td></tr>
              </table>
            </div>
            <p style="font-size:12px;color:#888">You can ignore this email — it was sent as a delivery test from your admin panel.</p>
          </div>
        </div>
      `,
    });
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
