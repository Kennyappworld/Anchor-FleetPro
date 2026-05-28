const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const prisma = new PrismaClient();

router.use(authenticate, scopeToTenant);

function tenantFilter(req) {
  const { role, vendorId, tenantId } = req.user;
  if (role === 'SUPER_ADMIN') return {};
  if (['OEM_ADMIN','WORKSHOP_STAFF'].includes(role)) return { vehicle: { vendor: { oemCompany: { tenantId } } } };
  return { vehicle: { vendorId } };
}

// GET /api/analytics/dashboard
router.get('/dashboard', requireRole(['SUPER_ADMIN','OEM_ADMIN','WORKSHOP_STAFF']), async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalJobs, activeJobs, completedThisMonth, revenue, topVehicles, byCategory] = await Promise.all([
      prisma.jobRequest.count({ where: tenantFilter(req) }),
      prisma.jobRequest.count({ where: { ...tenantFilter(req), status: { in: ['SUBMITTED','DIAGNOSED','ESTIMATE_SENT','APPROVED','REPAIR_STARTED'] } } }),
      prisma.jobRequest.count({ where: { ...tenantFilter(req), status: 'COMPLETED', completedAt: { gte: monthStart } } }),
      prisma.invoice.aggregate({ where: { paymentConfirmed: true, jobRequest: tenantFilter(req) }, _sum: { totalAmount: true } }),
      prisma.vehicle.findMany({
        take: 5,
        include: { invoices_via_jobs: { where: { paymentConfirmed: true }, select: { totalAmount: true } } },
        orderBy: { jobRequests: { _count: 'desc' } },
        where: req.user.role === 'SUPER_ADMIN' ? {} : req.user.role === 'OEM_ADMIN' ? { vendor: { oemCompany: { tenantId: req.user.tenantId } } } : { vendorId: req.user.vendorId },
      }),
      prisma.jobRequest.groupBy({ by: ['category'], _count: true, where: tenantFilter(req) }),
    ]);

    res.json({
      success: true,
      data: {
        totalJobs,
        activeJobs,
        completedThisMonth,
        revenueTotal: revenue._sum.totalAmount || 0,
        byCategory,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/monthly-revenue
router.get('/monthly-revenue', requireRole(['SUPER_ADMIN','OEM_ADMIN']), async (req, res, next) => {
  try {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const agg = await prisma.invoice.aggregate({
        where: { paymentConfirmed: true, paidAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      });
      months.push({ month: start.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }), revenue: agg._sum.totalAmount || 0 });
    }
    res.json({ success: true, data: months });
  } catch (err) { next(err); }
});

// GET /api/analytics/top-vehicles
router.get('/top-vehicles', requireRole(['SUPER_ADMIN','OEM_ADMIN','WORKSHOP_STAFF']), async (req, res, next) => {
  try {
    const filter = req.user.role === 'SUPER_ADMIN' ? {}
      : req.user.role === 'OEM_ADMIN' ? { vendor: { oemCompany: { tenantId: req.user.tenantId } } }
      : { vendorId: req.user.vendorId };
    const vehicles = await prisma.vehicle.findMany({
      where: filter, take: 10,
      include: { _count: { select: { jobRequests: true } } },
    });
    res.json({ success: true, data: vehicles });
  } catch (err) { next(err); }
});

module.exports = router;
