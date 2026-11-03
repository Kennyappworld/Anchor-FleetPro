const prisma = require('../config/prisma');
const emailService = require('../services/emailService');
const { logAction } = require('../services/auditService');
const { jobWhere } = require('../utils/tenant');

// Request bodies keep the names the web app sends (partsTotal / labourTotal);
// the database columns are partsCost / labourCost.
const toMoney = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

exports.getForJob = async (req, res, next) => {
  try {
    const job = await prisma.jobRequest.findFirst({ where: { id: req.params.jobId, ...jobWhere(req.user) }, select: { id: true } });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    const estimates = await prisma.estimate.findMany({
      where: { jobId: job.id },
      orderBy: { revision: 'desc' },
    });
    res.json({ success: true, data: estimates });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { jobId, notes } = req.body;
    const partsCost = toMoney(req.body.partsTotal ?? req.body.partsCost);
    const labourCost = toMoney(req.body.labourTotal ?? req.body.labourCost);
    if (partsCost === null || labourCost === null) return res.status(400).json({ success: false, error: 'Parts and labour must be non-negative amounts' });
    const totalCost = partsCost + labourCost;

    const job = await prisma.jobRequest.findFirst({
      where: { id: jobId, ...jobWhere(req.user) },
      include: { estimates: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    if (['AWAITING_PAYMENT', 'CLOSED'].includes(job.status)) return res.status(409).json({ success: false, error: 'This job is already invoiced or closed' });

    const revision = (job.estimates[0]?.revision || 0) + 1;
    const estimate = await prisma.estimate.create({
      data: { jobId, partsCost, labourCost, totalCost, notes: notes ? String(notes).slice(0, 4000) : null, status: 'PENDING', revision },
    });

    const updated = await prisma.jobRequest.update({
      where: { id: jobId },
      data: { status: 'ESTIMATE_SENT', estimateSentAt: new Date() },
      include: {
        vehicle: { include: { vendor: { include: { users: { where: { role: { in: ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR'] }, active: true }, take: 3 } } } } },
      },
    });

    // Notify vendor contacts (the old call used a different signature and sent nothing).
    emailService.sendEstimateReady({ job: updated, vendorEmails: updated.vehicle.vendor.users.map((u) => u.email) }).catch(() => {});

    await logAction(req, 'ESTIMATE_CREATED', 'Estimate', estimate.id, { jobId, totalCost });
    res.status(201).json({ success: true, data: estimate });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const existing = await prisma.estimate.findFirst({ where: { id: req.params.id, job: jobWhere(req.user) } });
    if (!existing) return res.status(404).json({ success: false, error: 'Estimate not found' });
    if (existing.status === 'APPROVED') return res.status(409).json({ success: false, error: 'An approved estimate cannot be changed. Create a new revision instead.' });

    const partsCost = toMoney(req.body.partsTotal ?? req.body.partsCost ?? existing.partsCost);
    const labourCost = toMoney(req.body.labourTotal ?? req.body.labourCost ?? existing.labourCost);
    if (partsCost === null || labourCost === null) return res.status(400).json({ success: false, error: 'Parts and labour must be non-negative amounts' });

    const estimate = await prisma.estimate.update({
      where: { id: existing.id },
      data: {
        partsCost, labourCost, totalCost: partsCost + labourCost,
        ...(req.body.notes !== undefined ? { notes: String(req.body.notes).slice(0, 4000) } : {}),
      },
    });
    await logAction(req, 'ESTIMATE_UPDATED', 'Estimate', existing.id);
    res.json({ success: true, data: estimate });
  } catch (err) { next(err); }
};
