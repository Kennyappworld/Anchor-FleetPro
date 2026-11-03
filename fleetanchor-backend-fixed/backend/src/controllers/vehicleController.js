const prisma = require('../config/prisma');
const { logAction } = require('../services/auditService');
const { vehicleWhere, resolveVendorId } = require('../utils/tenant');

// Scoped by vendor / OEM (the old filter used a tenantId that was never set,
// which let OEM-side users see every tenant's vehicles).
const tenantFilter = (req) => vehicleWhere(req.user);

const pageArgs = (q) => {
  const take = Math.min(Math.max(parseInt(q.limit) || 50, 1), 200);
  const page = Math.max(parseInt(q.page) || 1, 1);
  return { take, page, skip: (page - 1) * take };
};

// The vehicle in the URL, if the caller may touch it.
const findOwnVehicle = (req) => prisma.vehicle.findFirst({ where: { id: req.params.id, ...tenantFilter(req) } });

exports.list = async (req, res, next) => {
  try {
    const { status } = req.query;
    const { take, page, skip } = pageArgs(req.query);
    const where = { ...tenantFilter(req), ...(status ? { status: String(status) } : {}) };
    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where, skip, take,
        include: { vendor: { select: { companyName: true } }, _count: { select: { jobRequests: true } } },
        orderBy: { registeredAt: 'desc' },
      }),
      prisma.vehicle.count({ where }),
    ]);
    res.json({ success: true, data: vehicles, total, page, pages: Math.ceil(total / take) });
  } catch (err) { next(err); }
};

exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 64);
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
        estimates: { select: { partsCost: true, labourCost: true, totalCost: true, status: true } },
        invoices: { select: { totalAmount: true, paymentConfirmed: true, paidAt: true } },
        createdBy: { select: { fullName: true } },
        timelines: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const shouldHideCost = isFieldAgent || hideCost === 'true';

    const sanitized = jobs.map(j => {
      if (shouldHideCost) {
        const { estimates, invoices, ...rest } = j;
        return { ...rest, estimates: [], invoices: [] };
      }
      return { ...j, timeline: j.timelines }; // `timeline` kept for older screens
    });

    await logAction(req, 'VEHICLE_HISTORY_VIEWED', 'Vehicle', req.params.id);
    res.json({ success: true, data: { vehicle, jobs: sanitized, costHidden: shouldHideCost } });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { vin, plateNumber, make, model, year, engineNumber, vendorId } = req.body;
    const vid = await resolveVendorId(req.user, vendorId);
    if (!vid) return res.status(400).json({ success: false, error: 'A fleet you manage is required (vendorId)' });

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
    if (data.year !== undefined) data.year = parseInt(data.year) || undefined;
    const vehicle = await findOwnVehicle(req);
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    const updated = await prisma.vehicle.update({ where: { id: req.params.id }, data });
    await logAction(req, 'VEHICLE_UPDATED', 'Vehicle', req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    // OEM admins used to be able to delete any tenant's vehicle.
    const vehicle = await findOwnVehicle(req);
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found or access denied' });
    await prisma.vehicle.delete({ where: { id: req.params.id } });
    await logAction(req, 'VEHICLE_DELETED', 'Vehicle', req.params.id);
    res.json({ success: true, message: 'Vehicle removed' });
  } catch (err) { next(err); }
};

exports.bulkImport = async (req, res, next) => {
  try {
    const { vehicles } = req.body;
    const vid = await resolveVendorId(req.user, req.body.vendorId);
    if (!vid) return res.status(400).json({ success: false, error: 'A fleet you manage is required (vendorId)' });

    const results = { created: 0, skipped: 0, errors: [] };
    for (const v of vehicles) {
      try {
        const vin = (v.vin || v.VIN || '').toString().trim().toUpperCase();
        const plate = (v.plateNumber || v.plate || v['Plate Number'] || '').toString().trim().toUpperCase();
        if (!vin || !plate) { results.skipped++; continue; }
        // Never take over a vehicle that is registered to another fleet.
        const owner = await prisma.vehicle.findUnique({ where: { vin }, select: { vendorId: true } });
        if (owner && owner.vendorId !== vid) { results.skipped++; results.errors.push({ vin, error: 'VIN is registered to another fleet' }); continue; }
        await prisma.vehicle.upsert({
          where: { vin },
          create: {
            vin, plateNumber: plate,
            make: (v.make || v.Make || 'Unknown').toString().trim(),
            model: (v.model || v.Model || 'Unknown').toString().trim(),
            year: parseInt(v.year || v.Year) || new Date().getFullYear(),
            engineNumber: (v.engineNumber || v.engine || v['Engine Number'] || '').toString().trim() || null,
            category: (v.category || v.Category || '').toString().trim() || null,
            vendorId: vid,
          },
          update: {
            plateNumber: plate,
            make: (v.make || v.Make || 'Unknown').toString().trim(),
            model: (v.model || v.Model || 'Unknown').toString().trim(),
            year: parseInt(v.year || v.Year) || new Date().getFullYear(),
          },
        });
        results.created++;
      } catch (e) {
        results.errors.push({ vin: (v && (v.vin || v.VIN)) || null, error: 'Could not import this row' });
        results.skipped++;
      }
    }
    await logAction(req, 'VEHICLES_BULK_IMPORTED', 'Vehicle', vid, { count: results.created });
    res.json({ success: true, ...results });
  } catch (err) { next(err); }
};

exports.updateServiceSchedule = async (req, res, next) => {
  try {
    const {
      lastServiceDate, lastServiceOdometer,
      currentOdometer, serviceIntervalDays, serviceIntervalKm,
    } = req.body;

    if (!(await findOwnVehicle(req))) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    const last = lastServiceDate ? new Date(lastServiceDate) : null;
    const nextDate = last && serviceIntervalDays
      ? new Date(last.getTime() + serviceIntervalDays * 24 * 60 * 60 * 1000)
      : null;
    const nextOdo = lastServiceOdometer && serviceIntervalKm
      ? parseInt(lastServiceOdometer) + parseInt(serviceIntervalKm)
      : null;

    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: {
        lastServiceDate: last,
        lastServiceOdometer: lastServiceOdometer ? parseInt(lastServiceOdometer) : null,
        currentOdometer: currentOdometer ? parseInt(currentOdometer) : null,
        serviceIntervalDays: serviceIntervalDays ? parseInt(serviceIntervalDays) : null,
        serviceIntervalKm: serviceIntervalKm ? parseInt(serviceIntervalKm) : null,
        nextServiceDate: nextDate,
        nextServiceOdometer: nextOdo,
        serviceAlertSent: false, // reset alert so new alerts fire for next cycle
      },
    });

    await logAction(req, 'VEHICLE_SERVICE_UPDATED', 'Vehicle', req.params.id, {
      lastServiceDate, nextServiceDate: nextDate, nextServiceOdometer: nextOdo,
    });
    res.json({ success: true, data: vehicle });
  } catch (err) { next(err); }
};

exports.updateOdometer = async (req, res, next) => {
  try {
    const { currentOdometer } = req.body;
    const odo = parseInt(currentOdometer);
    if (!Number.isFinite(odo) || odo < 0) return res.status(400).json({ success: false, error: 'currentOdometer required' });
    if (!(await findOwnVehicle(req))) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    const vehicle = await prisma.vehicle.update({
      where: { id: req.params.id },
      data: { currentOdometer: odo },
    });
    res.json({ success: true, data: vehicle });
  } catch (err) { next(err); }
};
