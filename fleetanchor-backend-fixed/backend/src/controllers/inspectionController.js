const crypto = require('crypto');
const prisma = require('../config/prisma');
const { escHtml, sanitizeSerial, sanitizePlate, sanitizeOdometer } = require('../utils/sanitize');
const logger = require('../config/logger');
const { logAction } = require('../services/auditService');

const SESSION_WINDOW_MS = 5 * 60 * 1000; // 5 min between scan and odometer
const TRIAL_DAYS = 60; // 2-month trial for all plans

// ─── FEATURE FLAG CHECK ────────────────────────────────────────────────────────
async function isFeatureEnabled(key) {
  try {
    const flag = await prisma.featureFlag.findUnique({ where: { key } });
    return flag ? flag.enabled : true; // default on if not configured
  } catch { return true; }
}

// ─── PLAN ACCESS CHECK ─────────────────────────────────────────────────────────
async function checkInspectionAccess(vendorId) {
  const featureOn = await isFeatureEnabled('driver_app');
  if (!featureOn) return { allowed: false, reason: 'Driver app feature is currently disabled by administrator.' };

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { subscriptions: { where: { status: { in: ['ACTIVE', 'EXPIRING'] } }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!vendor) return { allowed: false, reason: 'Vendor not found' };

  const plan = vendor.subscriptions[0]?.plan || 'STARTER';
  if (plan === 'ENTERPRISE') return { allowed: true, plan, trial: false };

  const now = new Date();
  if (!vendor.inspectionTrialStartedAt) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { inspectionTrialStartedAt: now } });
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    return { allowed: true, plan, trial: true, daysLeft: TRIAL_DAYS, trialEndsAt: trialEnd };
  }

  const trialEnd = new Date(vendor.inspectionTrialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
  if (daysLeft > 0) return { allowed: true, plan, trial: true, daysLeft, trialEndsAt: trialEnd };
  if (plan === 'ENTERPRISE') return { allowed: true, plan, trial: false };
  return { allowed: false, plan, trial: true, daysLeft: 0, trialEndsAt: trialEnd, reason: 'Trial expired. Upgrade to Enterprise.' };
}

// ─── SCAN VEHICLE (POST /api/inspections/scan) ────────────────────────────────
exports.scanVehicle = async (req, res) => {
  try {
    const { plateNumber, vin } = req.body;
    const vendorId = req.user.vendorId;
    const driverId = req.user.userId;

    if (!plateNumber && !vin) return res.status(400).json({ success: false, error: 'Provide plateNumber or VIN' });
    const cleanPlate = plateNumber ? sanitizePlate(plateNumber) : undefined;
    const cleanVin = vin ? String(vin).replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,17) : undefined;

    const access = await checkInspectionAccess(vendorId);
    if (!access.allowed) return res.status(403).json({ success: false, error: access.reason, trialExpired: true });

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        vendorId,
        OR: [
          ...(plateNumber ? [{ plateNumber: { equals: plateNumber.trim(), mode: 'insensitive' } }] : []),
          ...(vin ? [{ vin: { equals: vin.trim(), mode: 'insensitive' } }] : []),
        ],
      },
      include: {
        documents: { where: { expiryDate: { gte: new Date() } }, orderBy: { expiryDate: 'asc' } },
        tyreRecords: { where: { isCurrent: true }, orderBy: { position: 'asc' } },
        tyreConfig: true,
        jobRequests: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, jobNumber: true, status: true, description: true, createdAt: true } },
      },
    });

    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found in your fleet' });

    // Expire existing open sessions for this driver
    await prisma.inspectionSession.updateMany({ where: { driverId, status: 'OPEN' }, data: { status: 'EXPIRED' } });

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_WINDOW_MS);

    const session = await prisma.inspectionSession.create({
      data: { vehicleId: vehicle.id, driverId, sessionToken, expiresAt, status: 'OPEN' },
    });

    // Get driver details from user record + licence table
    const driver = await prisma.user.findUnique({ where: { id: driverId }, select: { fullName: true, email: true } });
    const driverLicence = await prisma.driverLicence.findFirst({ where: { vendorId, email: driver?.email }, orderBy: { createdAt: 'desc' } });

    // Get active checklist template
    const checklistTemplate = await prisma.checklistTemplate.findFirst({
      where: { vendorId, isDefault: true, type: 'PRE_TRIP' },
    });

    // Get inspection frequency setting (from tyreConfig or vendor settings)
    const inspectionFrequency = vehicle.tyreConfig?.rotationInterval || null;

    await logAction(req, 'INSPECTION_SCAN', 'Vehicle', vehicle.id, { plateNumber: vehicle.plateNumber });

    res.json({
      success: true,
      data: {
        sessionToken,
        expiresAt,
        sessionWindowSeconds: SESSION_WINDOW_MS / 1000,
        access,
        vehicle: {
          id: vehicle.id,
          plateNumber: vehicle.plateNumber,
          vin: vehicle.vin,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          category: vehicle.category,
          currentOdometer: vehicle.currentOdometer,
          lastServiceDate: vehicle.lastServiceDate,
          nextServiceDate: vehicle.nextServiceDate,
          nextServiceOdometer: vehicle.nextServiceOdometer,
          serviceIntervalKm: vehicle.serviceIntervalKm,
          documents: vehicle.documents.map(d => ({
            docType: d.docType, docNumber: d.docNumber, expiryDate: d.expiryDate,
            daysUntilExpiry: Math.ceil((new Date(d.expiryDate) - new Date()) / 86400000),
          })),
          tyrePositions: vehicle.tyreConfig?.positions || ['FL', 'FR', 'RL', 'RR'],
          totalTyres: vehicle.tyreConfig?.totalTyres || 4,
          currentTyres: vehicle.tyreRecords.map(t => ({
            id: t.id, position: t.position, serialNumber: t.serialNumber,
            brand: t.brand, model: t.model, sizeSpec: t.sizeSpec,
            fittedOdometer: t.fittedOdometer, kmCovered: t.kmCovered,
          })),
          recentJobs: vehicle.jobRequests,
        },
        driver: {
          id: driverId,
          fullName: driver?.fullName || '',
          email: driver?.email || '',
          licenceNumber: driverLicence?.licenceNumber || '',
          licenceCategory: driverLicence?.licenceCategory || '',
          phone: driverLicence?.phone || '',
        },
        checklistTemplate: checklistTemplate ? {
          id: checklistTemplate.id,
          name: checklistTemplate.name,
          items: checklistTemplate.items,
        } : null,
      },
    });
  } catch (err) {
    logger.error('scanVehicle error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── CAPTURE ODOMETER (POST /api/inspections/odometer) ───────────────────────
exports.captureOdometer = async (req, res) => {
  try {
    const { sessionToken, odometer } = req.body;
    const driverId = req.user.userId;

    if (!sessionToken || !odometer) return res.status(400).json({ success: false, error: 'sessionToken and odometer required' });

    // Validate tyre positions count to prevent abuse
    if (tyres && Object.keys(tyres).length > 20) {
      return res.status(400).json({ success: false, error: 'Too many tyre positions submitted' });
    }
    // Validate notes length
    if (notes && notes.length > 2000) {
      return res.status(400).json({ success: false, error: 'Notes too long (max 2000 characters)' });
    }

    const session = await prisma.inspectionSession.findUnique({ where: { sessionToken } });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.driverId !== driverId) return res.status(403).json({ success: false, error: 'Session belongs to different driver' });
    if (session.status !== 'OPEN') return res.status(400).json({ success: false, error: 'Session expired or completed. Scan vehicle again.' });
    if (new Date() > session.expiresAt) {
      await prisma.inspectionSession.update({ where: { sessionToken }, data: { status: 'EXPIRED' } });
      return res.status(400).json({ success: false, error: 'Session expired. You must scan the vehicle and enter odometer within 5 minutes.' });
    }

    const vehicle = await prisma.vehicle.findUnique({ where: { id: session.vehicleId } });
    if (vehicle.currentOdometer && parseInt(odometer) < vehicle.currentOdometer) {
      return res.status(400).json({
        success: false,
        error: `Odometer ${parseInt(odometer).toLocaleString()} km is less than last recorded ${vehicle.currentOdometer.toLocaleString()} km. Possible fraud — check reported.`,
      });
    }

    await prisma.inspectionSession.update({ where: { sessionToken }, data: { odometerCaptured: parseInt(odometer) } });
    await logAction(req, 'ODOMETER_CAPTURED', 'Vehicle', session.vehicleId, { odometer: parseInt(odometer) });

    res.json({ success: true, data: { odometer: parseInt(odometer), remainingSeconds: Math.max(0, Math.floor((session.expiresAt - new Date()) / 1000)) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── SUBMIT INSPECTION (POST /api/inspections/submit) ────────────────────────
exports.submitInspection = async (req, res) => {
  try {
    const { sessionToken, inspectionType, overallCondition, driverName, driverLicence: driverLicNum, driverPhone, checklist, tyres, notes, photoUrls, latitude, longitude } = req.body;
    const driverId = req.user.userId;
    const vendorId = req.user.vendorId;

    const session = await prisma.inspectionSession.findUnique({ where: { sessionToken } });
    if (!session || session.driverId !== driverId) return res.status(403).json({ success: false, error: 'Invalid session' });
    if (session.status !== 'OPEN' || new Date() > session.expiresAt) return res.status(400).json({ success: false, error: 'Session expired. Please scan vehicle again.' });
    if (!session.odometerCaptured) return res.status(400).json({ success: false, error: 'Odometer not yet captured for this session.' });

    const vehicle = await prisma.vehicle.findUnique({ where: { id: session.vehicleId }, include: { tyreRecords: { where: { isCurrent: true } } } });
    const odometer = session.odometerCaptured;
    const prevOdometer = vehicle.currentOdometer || odometer;
    const deltaKm = Math.max(0, odometer - prevOdometer);

    const tyreSnapshots = {};
    const tyreAlerts = [];
    const positions = Object.keys(tyres || {});

    for (const pos of positions) {
      const submitted = tyres[pos];
      if (!submitted) continue;
      const currentTyre = vehicle.tyreRecords.find(t => t.position === pos);
      const submittedSerial = sanitizeSerial(submitted.serial || '');

      if (submittedSerial && submitted.newTyre !== true) {
        // Check if this serial belongs to ANOTHER vehicle (cross-vehicle tyre theft detection)
        const foreignTyre = await prisma.tyreRecord.findFirst({
          where: { serialNumber: submittedSerial, isCurrent: true, NOT: { vehicleId: vehicle.id } },
          include: { vehicle: { select: { plateNumber: true, make: true, model: true, vendorId: true } } },
        });
        if (foreignTyre) {
          const isSameVendor = foreignTyre.vehicle.vendorId === vendorId;
          tyreAlerts.push({
            position: pos,
            type: 'FOREIGN_TYRE',
            severity: 'CRITICAL',
            serial: submittedSerial,
            message: `Tyre ${pos} serial ${submittedSerial} is registered on ${foreignTyre.vehicle.plateNumber} (${foreignTyre.vehicle.make} ${foreignTyre.vehicle.model})${isSameVendor ? ' in your fleet' : ' in another fleet'}.`,
            foreignVehicle: { plateNumber: foreignTyre.vehicle.plateNumber, make: foreignTyre.vehicle.make, model: foreignTyre.vehicle.model },
          });
          tyreSnapshots[pos] = { serial: submittedSerial, condition: submitted.condition, pressure: submitted.pressure, event: 'FOREIGN_TYRE' };
          continue;
        }
      }

      if (submitted.newTyre && submittedSerial) {
        if (currentTyre) await prisma.tyreRecord.update({ where: { id: currentTyre.id }, data: { isCurrent: false, removedOdometer: odometer, removedAt: new Date() } });
        await prisma.tyreRecord.create({
          data: { vehicleId: vehicle.id, vendorId, position: pos, serialNumber: submittedSerial, brand: submitted.brand || null, model: submitted.model || null, sizeSpec: submitted.sizeSpec || null, fittedOdometer: odometer, kmCovered: 0, isCurrent: true, fittedByDriverId: driverId },
        });
        tyreSnapshots[pos] = { serial: submittedSerial, kmCovered: 0, condition: submitted.condition, pressure: submitted.pressure, event: 'NEW_TYRE' };
      } else if (submittedSerial && currentTyre && submittedSerial !== currentTyre.serialNumber.toUpperCase()) {
        tyreAlerts.push({
          position: pos, type: 'SERIAL_MISMATCH', severity: 'HIGH', serial: submittedSerial,
          message: `Tyre ${pos} mismatch. Expected ${currentTyre.serialNumber}, found ${submittedSerial}.`,
        });
        tyreSnapshots[pos] = { serial: submittedSerial, kmCovered: currentTyre.kmCovered, condition: submitted.condition, pressure: submitted.pressure, event: 'SERIAL_MISMATCH' };
      } else if (currentTyre) {
        const newKm = currentTyre.kmCovered + deltaKm;
        await prisma.tyreRecord.update({ where: { id: currentTyre.id }, data: { kmCovered: newKm } });
        tyreSnapshots[pos] = { serial: currentTyre.serialNumber, kmCovered: newKm, condition: submitted.condition, pressure: submitted.pressure, event: 'OK' };
      }
    }

    // Audit hash chain
    const prevInspection = await prisma.vehicleInspection.findFirst({ where: { vehicleId: vehicle.id }, orderBy: { submittedAt: 'desc' }, select: { auditHash: true } });
    const auditHash = crypto.createHash('sha256').update(JSON.stringify({ vehicleId: vehicle.id, driverId, odometer, tyreSnapshots, checklist, submittedAt: new Date().toISOString(), prevHash: prevInspection?.auditHash || null })).digest('hex');

    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { currentOdometer: odometer } });

    const inspection = await prisma.vehicleInspection.create({
      data: {
        vehicleId: vehicle.id, vendorId, driverId,
        driverName: escHtml(driverName || req.user.email).slice(0, 100),
        driverLicence: driverLicNum || null,
        driverPhone: driverPhone || null,
        odometer, sessionId: session.id,
        inspectionType: inspectionType || 'PRE_TRIP',
        overallCondition: overallCondition || 'GOOD',
        notes: notes || null,
        ...(checklist || {}),
        tyreFL: tyreSnapshots['FL'] || null, tyreFR: tyreSnapshots['FR'] || null,
        tyreRL: tyreSnapshots['RL'] || null, tyreRR: tyreSnapshots['RR'] || null,
        photoUrls: photoUrls || [], auditHash,
        latitude: latitude || null, longitude: longitude || null,
      },
    });

    await prisma.inspectionSession.update({ where: { sessionToken }, data: { status: 'COMPLETED' } });
    await logAction(req, 'INSPECTION_SUBMITTED', 'VehicleInspection', inspection.id, { plateNumber: vehicle.plateNumber, odometer, tyreAlerts: tyreAlerts.length, deltaKm });

    // Update driver score async (non-blocking)
    updateDriverScore(driverId, vendorId, checklist || {}).catch(() => {});

    res.status(201).json({ success: true, data: { inspectionId: inspection.id, auditHash, odometer, deltaKm, tyreAlerts, tyreSnapshots } });
  } catch (err) {
    logger.error('submitInspection error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── UPDATE DRIVER SCORE (async background) ───────────────────────────────────
async function updateDriverScore(driverId, vendorId, checklist) {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    const inspections = await prisma.vehicleInspection.findMany({
      where: { driverId, vendorId, submittedAt: { gte: monthStart, lte: monthEnd } },
    });

    const total = inspections.length;
    const checklistKeys = ['lightsOk','brakesOk','engineOilOk','coolantOk','exhaustOk','wiperOk','hornOk','steeringOk','mirrorsOk'];
    let totalChecked = 0, totalPassed = 0;
    let tyreAlertCount = 0;

    for (const insp of inspections) {
      for (const key of checklistKeys) {
        if (insp[key] !== null && insp[key] !== undefined) { totalChecked++; if (insp[key]) totalPassed++; }
      }
      for (const tyreKey of ['tyreFL','tyreFR','tyreRL','tyreRR']) {
        const t = insp[tyreKey];
        if (t && (t.event === 'SERIAL_MISMATCH' || t.event === 'FOREIGN_TYRE')) tyreAlertCount++;
      }
    }

    const passRate = totalChecked > 0 ? (totalPassed / totalChecked) * 100 : 100;
    const score = Math.max(0, Math.min(100, Math.round(passRate - (tyreAlertCount * 10))));

    await prisma.driverScore.upsert({
      where: { driverId_month_year: { driverId, month, year } },
      update: { totalInspections: total, passRate, tyreAlerts: tyreAlertCount, score, updatedAt: new Date() },
      create: { driverId, vendorId, month, year, totalInspections: total, onTimeInspections: total, passRate, tyreAlerts: tyreAlertCount, score },
    });
  } catch (err) { logger.warn('updateDriverScore failed:', err.message); }
}

// ─── LIST INSPECTIONS for a vehicle ───────────────────────────────────────────
exports.listForVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const vendorId = req.user.vendorId;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    const [inspections, tyreHistory] = await Promise.all([
      prisma.vehicleInspection.findMany({ where: { vehicleId, vendorId }, orderBy: { submittedAt: 'desc' }, take: 50 }),
      prisma.tyreRecord.findMany({ where: { vehicleId }, orderBy: [{ position: 'asc' }, { fittedAt: 'desc' }] }),
    ]);
    res.json({ success: true, data: { inspections, tyreHistory } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ─── CURRENT TYRES ────────────────────────────────────────────────────────────
exports.currentTyres = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const vendorId = req.user.vendorId;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    const tyres = await prisma.tyreRecord.findMany({ where: { vehicleId, isCurrent: true }, orderBy: { position: 'asc' } });
    res.json({ success: true, data: tyres });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ─── REGISTER TYRE CHANGE (fleet manager) ────────────────────────────────────
exports.registerTyreChange = async (req, res) => {
  try {
    const { vehicleId, position, serialNumber, brand, model, sizeSpec, odometer } = req.body;
    const vendorId = req.user.vendorId;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    await prisma.tyreRecord.updateMany({ where: { vehicleId, position, isCurrent: true }, data: { isCurrent: false, removedOdometer: odometer || vehicle.currentOdometer, removedAt: new Date() } });
    const tyre = await prisma.tyreRecord.create({
      data: { vehicleId, vendorId, position, serialNumber: serialNumber.trim().toUpperCase(), brand: brand || null, model: model || null, sizeSpec: sizeSpec || null, fittedOdometer: odometer || vehicle.currentOdometer || 0, kmCovered: 0, isCurrent: true, fittedByDriverId: req.user.userId },
    });
    await logAction(req, 'TYRE_REGISTERED', 'TyreRecord', tyre.id, { vehicleId, position, serialNumber });
    res.status(201).json({ success: true, data: tyre });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ─── SET TYRE CONFIG (fleet manager sets positions/count) ─────────────────────
exports.setTyreConfig = async (req, res) => {
  try {
    const { vehicleId, totalTyres, positions, rotationInterval, replacementKm } = req.body;
    const vendorId = req.user.vendorId;
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    const config = await prisma.vehicleTyreConfig.upsert({
      where: { vehicleId },
      update: { totalTyres, positions, rotationInterval: rotationInterval || null, replacementKm: replacementKm || null, updatedBy: req.user.userId },
      create: { vehicleId, totalTyres: totalTyres || 4, positions: positions || ['FL','FR','RL','RR'], rotationInterval: rotationInterval || null, replacementKm: replacementKm || null, updatedBy: req.user.userId },
    });
    res.json({ success: true, data: config });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ─── CHECKLIST TEMPLATES ──────────────────────────────────────────────────────
exports.getTemplates = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const templates = await prisma.checklistTemplate.findMany({ where: { vendorId }, orderBy: { isDefault: 'desc' } });
    res.json({ success: true, data: templates });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.saveTemplate = async (req, res) => {
  try {
    const { id, name, type, items, isDefault } = req.body;
    const vendorId = req.user.vendorId;
    if (isDefault) await prisma.checklistTemplate.updateMany({ where: { vendorId, type }, data: { isDefault: false } });
    let template;
    if (id) {
      template = await prisma.checklistTemplate.update({ where: { id }, data: { name, type, items, isDefault: isDefault || false } });
    } else {
      template = await prisma.checklistTemplate.create({ data: { vendorId, name, type: type || 'PRE_TRIP', items, isDefault: isDefault || false } });
    }
    res.json({ success: true, data: template });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ─── DRIVER LEADERBOARD ───────────────────────────────────────────────────────
exports.driverLeaderboard = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const scores = await prisma.driverScore.findMany({
      where: { vendorId, month, year },
      orderBy: { score: 'desc' },
    });
    // Enrich with driver names
    const driverIds = scores.map(s => s.driverId);
    const drivers = await prisma.user.findMany({ where: { id: { in: driverIds } }, select: { id: true, fullName: true, email: true } });
    const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]));
    const enriched = scores.map((s, i) => ({ ...s, rank: i + 1, driver: driverMap[s.driverId] || { fullName: 'Unknown' } }));
    res.json({ success: true, data: enriched });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ─── DASHBOARD SUMMARY ────────────────────────────────────────────────────────
exports.dashboardSummary = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const now = new Date();
    const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalInspections, recentInspections, vehiclesInspected, tyreAlertCount, access] = await Promise.all([
      prisma.vehicleInspection.count({ where: { vendorId } }),
      prisma.vehicleInspection.count({ where: { vendorId, submittedAt: { gte: thirtyAgo } } }),
      prisma.vehicleInspection.findMany({ where: { vendorId, submittedAt: { gte: thirtyAgo } }, select: { vehicleId: true }, distinct: ['vehicleId'] }),
      prisma.vehicleInspection.count({ where: { vendorId, submittedAt: { gte: thirtyAgo }, OR: [{ tyreFL: { path: ['event'], equals: 'SERIAL_MISMATCH' } }, { tyreFR: { path: ['event'], equals: 'FOREIGN_TYRE' } }] } }),
      checkInspectionAccess(vendorId),
    ]);

    res.json({ success: true, data: { totalInspections, recentInspections, vehiclesInspectedThisMonth: vehiclesInspected.length, tyreAlerts: tyreAlertCount, access } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// ─── FEATURE FLAGS (Super Admin) ──────────────────────────────────────────────
exports.listFeatureFlags = async (req, res) => {
  try {
    const flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    res.json({ success: true, data: flags });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.toggleFeatureFlag = async (req, res) => {
  try {
    const { key, enabled, label, description } = req.body;
    const flag = await prisma.featureFlag.upsert({
      where: { key },
      update: { enabled, updatedBy: req.user.userId },
      create: { key, enabled, label: label || key, description: description || null, updatedBy: req.user.userId },
    });
    await logAction(req, `FEATURE_${enabled ? 'ENABLED' : 'DISABLED'}`, 'FeatureFlag', flag.id, { key });
    res.json({ success: true, data: flag });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};
