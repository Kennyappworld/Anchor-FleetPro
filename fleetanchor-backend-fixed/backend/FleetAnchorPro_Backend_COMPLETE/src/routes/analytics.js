const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant } = require('../middleware/auth');
const prisma = require('../config/prisma');

router.use(authenticate, scopeToTenant);

function tenantFilter(req) {
  const { role, vendorId, tenantId } = req.user;
  if (role === 'SUPER_ADMIN') return {};
  if (['OEM_ADMIN','WORKSHOP_STAFF'].includes(role)) return { vehicle: { vendor: { oem: { tenantId } } } };
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
        orderBy: { jobRequests: { _count: 'desc' } },
        where: req.user.role === 'SUPER_ADMIN' ? {} : req.user.role === 'OEM_ADMIN' ? { vendor: { oem: { tenantId: req.user.tenantId } } } : { vendorId: req.user.vendorId },
      }),
      prisma.jobRequest.groupBy({ by: ['category'], _count: true, where: tenantFilter(req) }),
    ]);

    // Extra stats for dashboard
    const [inRepair, totalVendors, monthlyRevenue] = await Promise.all([
      prisma.vehicle.count({ where: { status: 'IN_REPAIR', ...(req.user.role !== 'SUPER_ADMIN' ? { vendorId: req.user.vendorId } : {}) } }),
      req.user.role === 'SUPER_ADMIN' ? prisma.vendor.count({ where: { deletedAt: null, status: 'ACTIVE' } }) : Promise.resolve(0),
      (async () => {
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          const agg = await prisma.invoice.aggregate({
            where: { paymentConfirmed: true, paidAt: { gte: mStart, lte: mEnd } },
            _sum: { totalAmount: true },
          });
          months.push({ month: mStart.toLocaleString('en', { month: 'short' }), revenue: agg._sum.totalAmount || 0 });
        }
        return months;
      })(),
    ]);

    const completedMTDCount = await prisma.jobRequest.count({
      where: { ...tenantFilter(req), status: { in: ['REPAIR_COMPLETE','CLOSED'] }, updatedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }
    });

    res.json({
      success: true,
      data: {
        totalJobs,
        activeJobs,
        inRepair,
        totalVendors,
        completedThisMonth: completedThisMonth || completedMTDCount,
        revenueMTD: monthlyRevenue[monthlyRevenue.length - 1]?.revenue || 0,
        revenueTotal: revenue._sum.totalAmount || 0,
        monthlyRevenue,
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
      : req.user.role === 'OEM_ADMIN' ? { vendor: { oem: { tenantId: req.user.tenantId } } }
      : { vendorId: req.user.vendorId };
    const vehicles = await prisma.vehicle.findMany({
      where: filter, take: 10,
      include: { _count: { select: { jobRequests: true } } },
    });
    res.json({ success: true, data: vehicles });
  } catch (err) { next(err); }
});

// GET /api/analytics/vendor-dashboard — rich stats for vendor dashboard
router.get('/vendor-dashboard', async (req, res, next) => {
  try {
    const vendorId = req.user.vendorId;
    if (!vendorId) return res.status(403).json({ success: false, error: 'Vendor only' });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      totalVehicles, inRepair, activeJobs, completedThisMonth,
      totalSpendRaw, thisMonthSpendRaw, lastMonthSpendRaw,
      jobsByStatus, jobsByCategory, recentJobs,
      expiringDocs, expiredDocs,
      expiringLicences, expiredLicences,
      vehiclesDueService,
    ] = await Promise.all([
      prisma.vehicle.count({ where: { vendorId, status: { not: 'DECOMMISSIONED' } } }),
      prisma.vehicle.count({ where: { vendorId, status: 'IN_REPAIR' } }),
      prisma.jobRequest.count({ where: { vehicle: { vendorId }, status: { in: ['SUBMITTED','DIAGNOSED','ESTIMATE_SENT','ESTIMATE_APPROVED','REPAIR_STARTED'] } } }),
      prisma.jobRequest.count({ where: { vehicle: { vendorId }, status: 'REPAIR_COMPLETE', completedAt: { gte: monthStart } } }),
      prisma.invoice.aggregate({ where: { jobRequest: { vehicle: { vendorId } }, paymentConfirmed: true }, _sum: { totalAmount: true } }),
      prisma.invoice.aggregate({ where: { jobRequest: { vehicle: { vendorId } }, paymentConfirmed: true, paidAt: { gte: monthStart } }, _sum: { totalAmount: true } }),
      prisma.invoice.aggregate({ where: { jobRequest: { vehicle: { vendorId } }, paymentConfirmed: true, paidAt: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { totalAmount: true } }),
      prisma.jobRequest.groupBy({ by: ['status'], _count: true, where: { vehicle: { vendorId } } }),
      prisma.jobRequest.groupBy({ by: ['category'], _count: true, where: { vehicle: { vendorId } }, orderBy: { _count: { category: 'desc' } }, take: 5 }),
      prisma.jobRequest.findMany({ where: { vehicle: { vendorId } }, include: { vehicle: { select: { plateNumber: true, make: true, model: true } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.vehicleDocument.count({ where: { vendorId, expiryDate: { gte: now, lte: in30 } } }),
      prisma.vehicleDocument.count({ where: { vendorId, expiryDate: { lt: now } } }),
      prisma.driverLicence.count({ where: { vendorId, expiryDate: { gte: now, lte: in30 } } }),
      prisma.driverLicence.count({ where: { vendorId, expiryDate: { lt: now } } }),
      prisma.vehicle.count({ where: { vendorId, status: 'ACTIVE', nextServiceDate: { lte: in30 }, serviceAlertSent: false } }),
    ]);

    // 6-month cost trend
    const costTrend = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const agg = await prisma.invoice.aggregate({
        where: { jobRequest: { vehicle: { vendorId } }, paymentConfirmed: true, paidAt: { gte: mStart, lte: mEnd } },
        _sum: { totalAmount: true },
      });
      costTrend.push({
        month: mStart.toLocaleString('en', { month: 'short' }) + ' ' + mStart.getFullYear().toString().slice(2),
        amount: agg._sum.totalAmount || 0,
      });
    }

    const thisMonth = thisMonthSpendRaw._sum.totalAmount || 0;
    const lastMonth = lastMonthSpendRaw._sum.totalAmount || 0;
    const spendChange = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;

    res.json({
      success: true,
      data: {
        fleet: { total: totalVehicles, inRepair, available: totalVehicles - inRepair },
        jobs: { active: activeJobs, completedThisMonth, byStatus: jobsByStatus, byCategory: jobsByCategory },
        spend: {
          total: totalSpendRaw._sum.totalAmount || 0,
          thisMonth,
          lastMonth,
          spendChange,
          trend: costTrend,
        },
        compliance: {
          expiringDocs, expiredDocs,
          expiringLicences, expiredLicences,
          vehiclesDueService,
          totalAlerts: expiringDocs + expiredDocs + expiringLicences + expiredLicences + vehiclesDueService,
        },
        recentJobs,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
