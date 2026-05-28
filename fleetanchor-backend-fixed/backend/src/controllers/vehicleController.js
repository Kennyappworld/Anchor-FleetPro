const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const prisma = new PrismaClient();

// Determine vendor filter based on role
function tenantFilter(req) {
  const { role, vendorId, tenantId } = req.user;
  if (role === 'SUPER_ADMIN') return {};
  if (role === 'OEM_ADMIN' || role === 'WORKSHOP_STAFF') return { vendor: { oem: { tenantId } } };
  // FLEET_MANAGER, MAINTENANCE_SUPERVISOR, FIELD_AGENT — own vendor only
  return { vendorId };
}

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const where = { ...tenantFilter(req), ...(status ? { status } : {}) };
    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where, skip: (page - 1) * limit, take: +limit,
        include: { vendor: { select: { companyName: true } }, _count: { select: { jobRequests: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.vehicle.count({ where }),
    ]);
    res.json({ success: true, data: vehicles, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

exports.search = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const where = {
      ...tenantFilter(req),
      OR: [
        { vin: { contains: q.toUpperCase() } },
        { plateNumber: { contains: q.toUpperCase() } },
        { engineNumber: { contains: q, mode: 'insensitive' } },
      ],
    };
    const vehicles = await prisma.vehicle.findMany({
      where, take: 20,
      include: { vendor: { select: { companyName: true } } },
    });
    res.json({ success: true, data: vehicles });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      include: {
        vendor: { select: { id: true, companyName: true } },
        _count: { select: { jobRequests: true } },
      },
    });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    res.json({ success: true, data: vehicle });
  } catch (err) { next(err); }
};

exports.history = async (req, res, next) => {
  try {
    const { hideCost = false } = req.query;
    const isFieldAgent = req.user.role === 'FIELD_AGENT';

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
    });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    const jobs = await prisma.jobRequest.findMany({
      where: { vehicleId: req.params.id },
      include: {
        estimates: { select: { partsTotal: true, labourTotal: true, totalCost: true, status: true } },
        invoices: { select: { totalAmount: true, paymentConfirmed: true, paidAt: true } },
        createdBy: { select: { fullName: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const shouldHideCost = isFieldAgent || hideCost === 'true';

    const sanitized = jobs.map(j => {
      if (shouldHideCost) {
        const { estimates, invoices, ...rest } = j;
        return { ...rest, estimates: [], invoices: [] };
      }
      return j;
    });

    await logAction(req, 'VEHICLE_HISTORY_VIEWED', 'Vehicle', req.params.id);
    res.json({ success: true, data: { vehicle, jobs: sanitized, costHidden: shouldHideCost } });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { vin, plateNumber, make, model, year, engineNumber, vendorId } = req.body;
    const vid = req.user.role === 'FLEET_MANAGER' ? req.user.vendorId : vendorId;
    if (!vid) return res.status(400).json({ success: false, error: 'vendorId required' });

    const existing = await prisma.vehicle.findFirst({ where: { vin: vin.toUpperCase() } });
    if (existing) return res.status(409).json({ success: false, error: 'VIN already registered' });

    const vehicle = await prisma.vehicle.create({
      data: { vin: vin.toUpperCase(), plateNumber: plateNumber.toUpperCase(), make, model, year: +year, engineNumber, vendorId: vid },
    });
    await logAction(req, 'VEHICLE_CREATED', 'Vehicle', vehicle.id);
    res.status(201).json({ success: true, data: vehicle });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const allowed = ['plateNumber','make','model','year','engineNumber','status'];
    const data = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const vehicle = await prisma.vehicle.findFirst({ where: { id: req.params.id, ...tenantFilter(req) } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    const updated = await prisma.vehicle.update({ where: { id: req.params.id }, data });
    await logAction(req, 'VEHICLE_UPDATED', 'Vehicle', req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    await logAction(req, 'VEHICLE_DELETED', 'Vehicle', req.params.id);
    res.json({ success: true, message: 'Vehicle removed' });
  } catch (err) { next(err); }
};
