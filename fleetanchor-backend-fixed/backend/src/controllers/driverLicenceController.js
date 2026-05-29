const prisma = require('../config/prisma');
const logger = require('../config/logger');

// ─── LIST ──────────────────────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.query.vendorId;
    if (!vendorId) return res.status(400).json({ success: false, error: 'vendorId required' });

    const licences = await prisma.driverLicence.findMany({
      where: { vendorId },
      orderBy: { expiryDate: 'asc' },
    });

    const now = new Date();
    const enriched = licences.map(l => ({
      ...l,
      daysUntilExpiry: Math.ceil((new Date(l.expiryDate) - now) / (1000 * 60 * 60 * 24)),
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('driverLicence.list error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── ADD ───────────────────────────────────────────────────────────────────────
exports.add = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { driverName, phone, email, licenceNumber, licenceCategory, issuedDate, expiryDate, notes } = req.body;

    if (!driverName || !licenceCategory || !expiryDate) {
      return res.status(400).json({ success: false, error: 'driverName, licenceCategory and expiryDate are required' });
    }

    const licence = await prisma.driverLicence.create({
      data: {
        vendorId,
        driverName: driverName.trim(),
        phone: phone || null,
        email: email || null,
        licenceNumber: licenceNumber || null,
        licenceCategory: licenceCategory.trim().toUpperCase(),
        issuedDate: issuedDate ? new Date(issuedDate) : null,
        expiryDate: new Date(expiryDate),
        notes: notes || null,
      },
    });

    const now = new Date();
    res.status(201).json({
      success: true,
      data: { ...licence, daysUntilExpiry: Math.ceil((new Date(licence.expiryDate) - now) / (1000 * 60 * 60 * 24)) },
    });
  } catch (err) {
    logger.error('driverLicence.add error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── UPDATE ────────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { id } = req.params;
    const existing = await prisma.driverLicence.findFirst({ where: { id, vendorId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });

    const { driverName, phone, email, licenceNumber, licenceCategory, issuedDate, expiryDate, notes } = req.body;
    const expiryChanged = expiryDate && expiryDate !== existing.expiryDate.toISOString().split('T')[0];

    const updated = await prisma.driverLicence.update({
      where: { id },
      data: {
        ...(driverName && { driverName: driverName.trim() }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(email !== undefined && { email: email || null }),
        ...(licenceNumber !== undefined && { licenceNumber: licenceNumber || null }),
        ...(licenceCategory && { licenceCategory: licenceCategory.trim().toUpperCase() }),
        ...(issuedDate !== undefined && { issuedDate: issuedDate ? new Date(issuedDate) : null }),
        ...(expiryDate && { expiryDate: new Date(expiryDate) }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(expiryChanged && { alertSent30: false, alertSent15: false, alertSent7: false, alertSentDay: false }),
      },
    });

    const now = new Date();
    res.json({ success: true, data: { ...updated, daysUntilExpiry: Math.ceil((new Date(updated.expiryDate) - now) / (1000 * 60 * 60 * 24)) } });
  } catch (err) {
    logger.error('driverLicence.update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── DELETE ────────────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { id } = req.params;
    const existing = await prisma.driverLicence.findFirst({ where: { id, vendorId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Not found' });
    await prisma.driverLicence.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── BULK IMPORT ───────────────────────────────────────────────────────────────
exports.bulkImport = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'No rows provided' });
    }

    const results = { created: 0, failed: [] };

    for (const row of rows) {
      try {
        if (!row.driverName || !row.licenceCategory || !row.expiryDate) {
          results.failed.push({ row, reason: 'driverName, licenceCategory and expiryDate are required' });
          continue;
        }
        await prisma.driverLicence.create({
          data: {
            vendorId,
            driverName: String(row.driverName).trim(),
            phone: row.phone ? String(row.phone) : null,
            email: row.email ? String(row.email) : null,
            licenceNumber: row.licenceNumber ? String(row.licenceNumber) : null,
            licenceCategory: String(row.licenceCategory).trim().toUpperCase(),
            issuedDate: row.issuedDate ? new Date(row.issuedDate) : null,
            expiryDate: new Date(row.expiryDate),
            notes: row.notes ? String(row.notes) : null,
          },
        });
        results.created++;
      } catch (rowErr) {
        results.failed.push({ row, reason: rowErr.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) {
    logger.error('driverLicence.bulkImport error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── SUMMARY ───────────────────────────────────────────────────────────────────
exports.summary = async (req, res) => {
  try {
    const vendorId = req.user.vendorId || req.params.vendorId;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [total, expired, expiringSoon, compliant] = await Promise.all([
      prisma.driverLicence.count({ where: { vendorId } }),
      prisma.driverLicence.count({ where: { vendorId, expiryDate: { lt: now } } }),
      prisma.driverLicence.count({ where: { vendorId, expiryDate: { gte: now, lte: in30 } } }),
      prisma.driverLicence.count({ where: { vendorId, expiryDate: { gt: in30 } } }),
    ]);
    res.json({ success: true, data: { total, expired, expiringSoon, compliant } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
