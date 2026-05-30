const prisma = require('../config/prisma');
const logger = require('../config/logger');

const DOC_LABELS = {
  ROAD_WORTHINESS:    'Road Worthiness Certificate',
  VEHICLE_LICENCE:    'Vehicle Licence',
  INSURANCE:          'Insurance Certificate',
  HACKNEY_PERMIT:     'Hackney Permit',
  ECOWAS_BROWN_CARD:  'ECOWAS Brown Card',
  FIRE_EXTINGUISHER:  'Fire Extinguisher Certificate',
  FIRST_AID_KIT:      'First Aid Kit Certificate',
  SPEED_LIMITER:      'Speed Limiter Certificate',
  DRIVERS_LICENCE:    'Driver\'s Licence',
  VEHICLE_REGISTRATION: 'Vehicle Registration',
  CUSTOMS_PAPER:      'Customs Paper',
  OTHER:              'Other Document',
};

async function checkComplianceAccess(vendorId, userId) {
  // SUPER_ADMIN / OEM_ADMIN always have access
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { subscriptions: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!vendor) return { allowed: false, reason: 'Vendor not found' };

  const activeSub = vendor.subscriptions[0];
  const plan = activeSub?.plan || 'STARTER';

  // GROWTH + ENTERPRISE — full access always
  if (['GROWTH', 'ENTERPRISE'].includes(plan)) return { allowed: true, plan };

  // STARTER — 1-month trial
  const now = new Date();
  if (!vendor.complianceTrialStartedAt) {
    // First time accessing — start 30-day trial
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { complianceTrialStartedAt: now },
    });
    const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return { allowed: true, plan, trial: true, trialEndsAt: trialEnd, daysLeft: 30 };
  }

  const trialEnd = new Date(vendor.complianceTrialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

  if (daysLeft > 0) {
    return { allowed: true, plan, trial: true, trialEndsAt: trialEnd, daysLeft };
  }

  return { allowed: false, plan, trial: true, trialEndsAt: trialEnd, daysLeft: 0, reason: 'Trial expired. Upgrade to Growth or Enterprise to continue.' };
}

exports.list = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.query.vendorId;
    if (!vendorId) return res.status(400).json({ success: false, error: 'vendorId required' });

    if (req.user.role === 'FLEET_MANAGER') {
      const access = await checkComplianceAccess(vendorId, req.user.id);
      if (!access.allowed) return res.status(403).json({ success: false, error: access.reason, trialExpired: true });
      if (access.trial) res.setHeader('X-Compliance-Trial', JSON.stringify({ daysLeft: access.daysLeft, trialEndsAt: access.trialEndsAt }));
    }

    const docs = await prisma.vehicleDocument.findMany({
      where: { vendorId },
      include: {
        vehicle: { select: { id: true, plateNumber: true, make: true, model: true, year: true, vin: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const now = new Date();
    const enriched = docs.map(d => ({
      ...d,
      daysUntilExpiry: Math.ceil((new Date(d.expiryDate) - now) / (1000 * 60 * 60 * 24)),
      docTypeLabel: DOC_LABELS[d.docType] || d.docType,
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('compliance.list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.body.vendorId;
    const { vehicleId, docType, docNumber, issuedDate, expiryDate, notes } = req.body;

    if (!vehicleId || !docType || !expiryDate) {
      return res.status(400).json({ success: false, error: 'vehicleId, docType and expiryDate are required' });
    }

    // Check vehicle belongs to this vendor
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    // Upsert: one doc of each type per vehicle
    const doc = await prisma.vehicleDocument.upsert({
      where: {
        // Since there's no unique constraint on vehicleId+docType, we use create+findFirst
        id: 'new-' + Math.random(), // forces create path
      },
      update: {},
      create: {
        vehicleId,
        vendorId,
        docType,
        docNumber: docNumber || null,
        issuedDate: issuedDate ? new Date(issuedDate) : null,
        expiryDate: new Date(expiryDate),
        notes: notes || null,
        alertSent30: false,
        alertSent15: false,
        alertSent7: false,
        alertSentDay: false,
      },
    });

    res.status(201).json({ success: true, data: { ...doc, docTypeLabel: DOC_LABELS[doc.docType] } });
  } catch (err) {
    logger.error('compliance.create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Simpler create without upsert issues
exports.add = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.body.vendorId;
    const { vehicleId, docType, docNumber, issuedDate, expiryDate, notes } = req.body;

    if (!vehicleId || !docType || !expiryDate) {
      return res.status(400).json({ success: false, error: 'vehicleId, docType and expiryDate are required' });
    }

    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, vendorId } });
    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    const doc = await prisma.vehicleDocument.create({
      data: {
        vehicleId,
        vendorId,
        docType,
        docNumber: docNumber || null,
        issuedDate: issuedDate ? new Date(issuedDate) : null,
        expiryDate: new Date(expiryDate),
        notes: notes || null,
      },
      include: { vehicle: { select: { plateNumber: true, make: true, model: true } } },
    });

    res.status(201).json({ success: true, data: { ...doc, docTypeLabel: DOC_LABELS[doc.docType] } });
  } catch (err) {
    logger.error('compliance.add error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { id } = req.params;
    const { docNumber, issuedDate, expiryDate, notes, docType } = req.body;

    const doc = await prisma.vehicleDocument.findFirst({ where: { id, vendorId } });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    const updated = await prisma.vehicleDocument.update({
      where: { id },
      data: {
        ...(docType && { docType }),
        ...(docNumber !== undefined && { docNumber }),
        ...(issuedDate !== undefined && { issuedDate: issuedDate ? new Date(issuedDate) : null }),
        ...(expiryDate && { expiryDate: new Date(expiryDate), alertSent30: false, alertSent15: false, alertSent7: false, alertSentDay: false }),
        ...(notes !== undefined && { notes }),
      },
      include: { vehicle: { select: { plateNumber: true, make: true, model: true } } },
    });

    res.json({ success: true, data: { ...updated, docTypeLabel: DOC_LABELS[updated.docType] } });
  } catch (err) {
    logger.error('compliance.update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { id } = req.params;
    const doc = await prisma.vehicleDocument.findFirst({ where: { id, vendorId } });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    await prisma.vehicleDocument.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    logger.error('compliance.remove error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.bulkImport = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { rows } = req.body; // array of { plateNumber|vin, docType, docNumber, issuedDate, expiryDate }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No rows provided' });
    }

    const results = { created: 0, failed: [], skipped: 0 };

    for (const row of rows) {
      try {
        // Find vehicle by plate or VIN
        const vehicle = await prisma.vehicle.findFirst({
          where: {
            vendorId,
            OR: [
              { plateNumber: { equals: (row.plateNumber || '').trim(), mode: 'insensitive' } },
              { vin: { equals: (row.vin || '').trim(), mode: 'insensitive' } },
            ],
          },
        });

        if (!vehicle) {
          results.failed.push({ row, reason: `Vehicle not found: ${row.plateNumber || row.vin}` });
          continue;
        }

        const docType = (row.docType || '').toUpperCase().replace(/\s+/g, '_');
        if (!Object.keys(DOC_LABELS).includes(docType)) {
          results.failed.push({ row, reason: `Unknown document type: ${row.docType}` });
          continue;
        }

        if (!row.expiryDate) {
          results.failed.push({ row, reason: 'expiryDate is required' });
          continue;
        }

        await prisma.vehicleDocument.create({
          data: {
            vehicleId: vehicle.id,
            vendorId,
            docType,
            docNumber: row.docNumber || null,
            issuedDate: row.issuedDate ? new Date(row.issuedDate) : null,
            expiryDate: new Date(row.expiryDate),
            notes: row.notes || null,
          },
        });
        results.created++;
      } catch (rowErr) {
        results.failed.push({ row, reason: rowErr.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    logger.error('compliance.bulkImport error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.summary = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.params.vendorId;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [total, expired, expiringSoon, compliant] = await Promise.all([
      prisma.vehicleDocument.count({ where: { vendorId } }),
      prisma.vehicleDocument.count({ where: { vendorId, expiryDate: { lt: now } } }),
      prisma.vehicleDocument.count({ where: { vendorId, expiryDate: { gte: now, lte: in30 } } }),
      prisma.vehicleDocument.count({ where: { vendorId, expiryDate: { gt: in30 } } }),
    ]);

    res.json({ success: true, data: { total, expired, expiringSoon, compliant } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports.DOC_LABELS = DOC_LABELS;
