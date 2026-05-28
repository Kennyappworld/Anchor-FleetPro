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
