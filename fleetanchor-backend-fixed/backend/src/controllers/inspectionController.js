const crypto = require('crypto');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { logAction } = require('../services/auditService');

const SESSION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const TRIAL_DAYS = 60; // 2-month trial

// ─── PLAN ACCESS CHECK ─────────────────────────────────────────────────────────
async function checkInspectionAccess(vendorId) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'EXPIRING'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!vendor) return { allowed: false, reason: 'Vendor not found' };

  const plan = vendor.subscriptions[0]?.plan || 'STARTER';

  // Enterprise — always on
  if (plan === 'ENTERPRISE') return { allowed: true, plan, trial: false };

  // All plans — 2-month trial
  const now = new Date();
  if (!vendor.inspectionTrialStartedAt) {
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { inspectionTrialStartedAt: now },
    });
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    return { allowed: true, plan, trial: true, daysLeft: TRIAL_DAYS, trialEndsAt: trialEnd };
  }

  const trialEnd = new Date(vendor.inspectionTrialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

  if (daysLeft > 0) return { allowed: true, plan, trial: true, daysLeft, trialEndsAt: trialEnd };

  if (plan === 'ENTERPRISE') return { allowed: true, plan, trial: false };

  return {
    allowed: false,
    plan,
    trial: true,
    daysLeft: 0,
    trialEndsAt: trialEnd,
    reason: 'Trial expired. Upgrade to Enterprise for full driver inspection and tyre tracking.',
  };
}

// ─── SCAN VEHICLE (starts session) ────────────────────────────────────────────
// POST /api/inspections/scan
// Body: { plateNumber?, vin?, vendorId? }
exports.scanVehicle = async (req, res) => {
  try {
    const { plateNumber, vin } = req.body;
    const vendorId = req.user.vendorId;
    const driverId = req.user.userId;

    if (!plateNumber && !vin) {
      return res.status(400).json({ success: false, error: 'Provide plateNumber or VIN' });
    }

    // Plan check
    const access = await checkInspectionAccess(vendorId);
    if (!access.allowed) {
      return res.status(403).json({ success: false, error: access.reason, trialExpired: true, plan: access.plan });
    }

    // Find vehicle — must belong to this vendor
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        vendorId,
        OR: [
          ...(plateNumber ? [{ plateNumber: { equals: plateNumber.trim(), mode: 'insensitive' } }] : []),
          ...(vin ? [{ vin: { equals: vin.trim(), mode: 'insensitive' } }] : []),
        ],
      },
      include: {
        documents: {
          where: { expiryDate: { gte: new Date() } },
          orderBy: { expiryDate: 'asc' },
        },
        tyreRecords: {
          where: { isCurrent: true },
          orderBy: { position: 'asc' },
        },
        jobRequests: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, jobNumber: true, status: true, description: true, createdAt: true },
        },
      },
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Vehicle not found in your fleet' });
    }

    // Expire any existing open sessions for this driver
    await prisma.inspectionSession.updateMany({
      where: { driverId, status: 'OPEN' },
      data: { status: 'EXPIRED' },
    });

    // Create new session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_WINDOW_MS);

    const session = await prisma.inspectionSession.create({
      data: {
        vehicleId: vehicle.id,
        driverId,
        sessionToken,
        expiresAt,
        status: 'OPEN',
      },
    });

    // Get driver details
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: { fullName: true, email: true },
    });

    // Get active driver licence for this driver (if they're in the DriverLicence table)
    const driverLicence = await prisma.driverLicence.findFirst({
      where: { vendorId, email: driver?.email },
      orderBy: { createdAt: 'desc' },
    });

    await logAction(req, 'INSPECTION_SCAN', 'Vehicle', vehicle.id, {
      plateNumber: vehicle.plateNumber,
      sessionToken,
    });

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
          lastServiceOdometer: vehicle.lastServiceOdometer,
          nextServiceDate: vehicle.nextServiceDate,
          nextServiceOdometer: vehicle.nextServiceOdometer,
          serviceIntervalKm: vehicle.serviceIntervalKm,
          serviceIntervalDays: vehicle.serviceIntervalDays,
          documents: vehicle.documents.map(d => ({
            id: d.id,
            docType: d.docType,
            docNumber: d.docNumber,
            expiryDate: d.expiryDate,
            daysUntilExpiry: Math.ceil((new Date(d.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)),
          })),
          currentTyres: vehicle.tyreRecords.map(t => ({
            id: t.id,
            position: t.position,
            serialNumber: t.serialNumber,
            brand: t.brand,
            model: t.model,
            sizeSpec: t.sizeSpec,
            fittedOdometer: t.fittedOdometer,
            kmCovered: t.kmCovered,
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
      },
    });
  } catch (err) {
    logger.error('scanVehicle error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── CAPTURE ODOMETER (within session window) ─────────────────────────────────
// POST /api/inspections/odometer
// Body: { sessionToken, odometer }
exports.captureOdometer = async (req, res) => {
  try {
    const { sessionToken, odometer } = req.body;
    const driverId = req.user.userId;

    if (!sessionToken || !odometer) {
      return res.status(400).json({ success: false, error: 'sessionToken and odometer required' });
    }

    const session = await prisma.inspectionSession.findUnique({
      where: { sessionToken },
    });

    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.driverId !== driverId) return res.status(403).json({ success: false, error: 'Session belongs to different driver' });
    if (session.status !== 'OPEN') return res.status(400).json({ success: false, error: 'Session has expired or is completed' });
    if (new Date() > session.expiresAt) {
      await prisma.inspectionSession.update({ where: { sessionToken }, data: { status: 'EXPIRED' } });
      return res.status(400).json({ success: false, error: 'Session expired. Please scan vehicle again.' });
    }

    // Validate odometer makes sense (must be >= last known reading)
    const vehicle = await prisma.vehicle.findUnique({ where: { id: session.vehicleId } });
    if (vehicle.currentOdometer && odometer < vehicle.currentOdometer) {
      return res.status(400).json({
        success: false,
        error: `Odometer ${odometer.toLocaleString()} km is less than last recorded ${vehicle.currentOdometer.toLocaleString()} km`,
      });
    }

    await prisma.inspectionSession.update({
      where: { sessionToken },
      data: { odometerCaptured: parseInt(odometer) },
    });

    const remainingMs = session.expiresAt - new Date();
    res.json({
      success: true,
      data: {
        odometer: parseInt(odometer),
        remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── SUBMIT INSPECTION ────────────────────────────────────────────────────────
// POST /api/inspections/submit
exports.submitInspection = async (req, res) => {
  try {
    const {
      sessionToken,
      inspectionType,
      overallCondition,
      driverName, driverLicence: driverLicNum, driverPhone,
      checklist, // { lightsOk, brakesOk, ... }
      tyres,     // { FL: { serial, condition, pressure, newTyre, brand, model, sizeSpec }, ... }
      notes,
      photoUrls,
      latitude, longitude,
    } = req.body;

    const driverId = req.user.userId;
    const vendorId = req.user.vendorId;

    // Validate session
    const session = await prisma.inspectionSession.findUnique({ where: { sessionToken } });
    if (!session || session.driverId !== driverId) {
      return res.status(403).json({ success: false, error: 'Invalid session' });
    }
    if (session.status !== 'OPEN' || new Date() > session.expiresAt) {
      return res.status(400).json({ success: false, error: 'Session expired. Please scan vehicle again.' });
    }
    if (!session.odometerCaptured) {
      return res.status(400).json({ success: false, error: 'Odometer reading not yet captured for this session' });
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: session.vehicleId },
      include: { tyreRecords: { where: { isCurrent: true } } },
    });

    const odometer = session.odometerCaptured;
    const prevOdometer = vehicle.currentOdometer || odometer;
    const deltaKm = Math.max(0, odometer - prevOdometer);

    // ── Tyre processing ──────────────────────────────────────────────────────
    const tyreSnapshots = {};
    const tyreAlerts = [];
    const positions = ['FL', 'FR', 'RL', 'RR'];

    for (const pos of positions) {
      const submitted = tyres?.[pos];
      if (!submitted) continue;

      const currentTyre = vehicle.tyreRecords.find(t => t.position === pos);
      const submittedSerial = (submitted.serial || '').trim().toUpperCase();

      if (submitted.newTyre && submittedSerial) {
        // ── New tyre fitted ──────────────────────────────────────────────────
        if (currentTyre) {
          await prisma.tyreRecord.update({
            where: { id: currentTyre.id },
            data: { isCurrent: false, removedOdometer: odometer, removedAt: new Date() },
          });
        }
        await prisma.tyreRecord.create({
          data: {
            vehicleId: vehicle.id,
            vendorId,
            position: pos,
            serialNumber: submittedSerial,
            brand: submitted.brand || null,
            model: submitted.model || null,
            sizeSpec: submitted.sizeSpec || null,
            fittedOdometer: odometer,
            kmCovered: 0,
            isCurrent: true,
            fittedByDriverId: driverId,
          },
        });
        tyreSnapshots[pos] = { serial: submittedSerial, kmCovered: 0, condition: submitted.condition, pressure: submitted.pressure, event: 'NEW_TYRE' };

      } else if (submittedSerial && currentTyre && submittedSerial !== currentTyre.serialNumber.toUpperCase()) {
        // ── Mismatch — possible unauthorised swap ────────────────────────────
        tyreAlerts.push({
          position: pos,
          expected: currentTyre.serialNumber,
          found: submittedSerial,
          message: `Tyre ${pos} serial mismatch. Expected ${currentTyre.serialNumber}, found ${submittedSerial}`,
        });
        tyreSnapshots[pos] = { serial: submittedSerial, kmCovered: currentTyre.kmCovered, condition: submitted.condition, pressure: submitted.pressure, event: 'SERIAL_MISMATCH' };

      } else if (currentTyre) {
        // ── Normal — update km covered ───────────────────────────────────────
        const newKm = currentTyre.kmCovered + deltaKm;
        await prisma.tyreRecord.update({
          where: { id: currentTyre.id },
          data: { kmCovered: newKm },
        });
        tyreSnapshots[pos] = { serial: currentTyre.serialNumber, kmCovered: newKm, condition: submitted.condition, pressure: submitted.pressure, event: 'OK' };
      }
    }

    // ── Audit hash ───────────────────────────────────────────────────────────
    const prevInspection = await prisma.vehicleInspection.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: { submittedAt: 'desc' },
      select: { auditHash: true },
    });
    const hashContent = JSON.stringify({
      vehicleId: vehicle.id,
      driverId,
      odometer,
      tyreSnapshots,
      submittedAt: new Date().toISOString(),
      prevHash: prevInspection?.auditHash || null,
    });
    const auditHash = crypto.createHash('sha256').update(hashContent).digest('hex');

    // ── Update vehicle odometer ───────────────────────────────────────────────
    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { currentOdometer: odometer },
    });

    // ── Save inspection ───────────────────────────────────────────────────────
    const inspection = await prisma.vehicleInspection.create({
      data: {
        vehicleId: vehicle.id,
        vendorId,
        driverId,
        driverName: driverName || req.user.email,
        driverLicence: driverLicNum || null,
        driverPhone: driverPhone || null,
        odometer,
        sessionId: session.id,
        inspectionType: inspectionType || 'PRE_TRIP',
        overallCondition: overallCondition || 'GOOD',
        notes: notes || null,
        ...(checklist || {}),
        tyreFL: tyreSnapshots['FL'] || null,
        tyreFR: tyreSnapshots['FR'] || null,
        tyreRL: tyreSnapshots['RL'] || null,
        tyreRR: tyreSnapshots['RR'] || null,
        photoUrls: photoUrls || [],
        auditHash,
        latitude: latitude || null,
        longitude: longitude || null,
      },
    });

    // ── Close session ─────────────────────────────────────────────────────────
    await prisma.inspectionSession.update({
      where: { sessionToken },
      data: { status: 'COMPLETED' },
    });

    await logAction(req, 'INSPECTION_SUBMITTED', 'VehicleInspection', inspection.id, {
      plateNumber: vehicle.plateNumber,
      odometer,
      tyreAlerts: tyreAlerts.length,
      deltaKm,
    });

    // ── Notify fleet manager if tyre alerts ───────────────────────────────────
    if (tyreAlerts.length > 0) {
      await prisma.notification.createMany({
        data: tyreAlerts.map(alert => ({
          userId: null, // will target fleet managers via a separate query
          vendorId,
          type: 'TYRE_MISMATCH',
          title: `Tyre mismatch on ${vehicle.plateNumber}`,
          message: alert.message,
          metadata: JSON.stringify(alert),
        })).slice(0, 1), // Prisma createMany doesn't allow complex queries inline
      }).catch(() => {}); // notifications are non-critical
    }

    res.status(201).json({
      success: true,
      data: {
        inspectionId: inspection.id,
        auditHash,
        odometer,
        deltaKm,
        tyreAlerts,
        tyreSnapshots,
      },
    });
  } catch (err) {
    logger.error('submitInspection error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── LIST INSPECTIONS for a vehicle ───────────────────────────────────────────
exports.listForVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const vendorId = req.user.vendorId;

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    const [inspections, tyreHistory] = await Promise.all([
      prisma.vehicleInspection.findMany({
        where: { vehicleId, vendorId },
        orderBy: { submittedAt: 'desc' },
        take: 50,
      }),
      prisma.tyreRecord.findMany({
        where: { vehicleId },
        orderBy: [{ position: 'asc' }, { fittedAt: 'desc' }],
      }),
    ]);

    res.json({ success: true, data: { inspections, tyreHistory } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── CURRENT TYRES for a vehicle ──────────────────────────────────────────────
exports.currentTyres = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const vendorId = req.user.vendorId;

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    const tyres = await prisma.tyreRecord.findMany({
      where: { vehicleId, isCurrent: true },
      orderBy: { position: 'asc' },
    });

    res.json({ success: true, data: tyres });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── UPDATE TYRE (fleet manager registers change) ─────────────────────────────
exports.registerTyreChange = async (req, res) => {
  try {
    const { vehicleId, position, serialNumber, brand, model, sizeSpec, odometer } = req.body;
    const vendorId = req.user.vendorId;

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    // Remove current tyre at position
    await prisma.tyreRecord.updateMany({
      where: { vehicleId, position, isCurrent: true },
      data: { isCurrent: false, removedOdometer: odometer || vehicle.currentOdometer, removedAt: new Date() },
    });

    const tyre = await prisma.tyreRecord.create({
      data: {
        vehicleId,
        vendorId,
        position,
        serialNumber: serialNumber.trim().toUpperCase(),
        brand: brand || null,
        model: model || null,
        sizeSpec: sizeSpec || null,
        fittedOdometer: odometer || vehicle.currentOdometer || 0,
        kmCovered: 0,
        isCurrent: true,
        fittedByDriverId: req.user.userId,
      },
    });

    await logAction(req, 'TYRE_CHANGED', 'TyreRecord', tyre.id, { vehicleId, position, serialNumber });

    res.status(201).json({ success: true, data: tyre });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET inspection dashboard summary ────────────────────────────────────────
exports.dashboardSummary = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalInspections, recentInspections, tyreAlerts, vehiclesInspected] = await Promise.all([
      prisma.vehicleInspection.count({ where: { vendorId } }),
      prisma.vehicleInspection.count({ where: { vendorId, submittedAt: { gte: thirtyDaysAgo } } }),
      prisma.vehicleInspection.count({
        where: {
          vendorId,
          OR: [
            { tyreFL: { path: ['event'], equals: 'SERIAL_MISMATCH' } },
            { tyreFR: { path: ['event'], equals: 'SERIAL_MISMATCH' } },
            { tyreRL: { path: ['event'], equals: 'SERIAL_MISMATCH' } },
            { tyreRR: { path: ['event'], equals: 'SERIAL_MISMATCH' } },
          ],
        },
      }),
      prisma.vehicleInspection.findMany({
        where: { vendorId, submittedAt: { gte: thirtyDaysAgo } },
        select: { vehicleId: true },
        distinct: ['vehicleId'],
      }),
    ]);

    const access = await checkInspectionAccess(vendorId);

    res.json({
      success: true,
      data: {
        totalInspections,
        recentInspections,
        tyreAlerts,
        vehiclesInspectedThisMonth: vehiclesInspected.length,
        access,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
