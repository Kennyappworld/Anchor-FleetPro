const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const { sendEmail } = require('../services/emailService');
const prisma = new PrismaClient();

exports.getForJob = async (req, res, next) => {
  try {
    const estimates = await prisma.estimate.findMany({
      where: { jobId: req.params.jobId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: estimates });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { jobId, partsTotal, labourTotal, notes } = req.body;
    const totalCost = parseFloat(partsTotal) + parseFloat(labourTotal);

    const estimate = await prisma.estimate.create({
      data: { jobId, partsTotal: +partsTotal, labourTotal: +labourTotal, totalCost, notes, status: 'PENDING' },
    });

    // Update job status to ESTIMATE_SENT
    const job = await prisma.jobRequest.update({
      where: { id: jobId },
      data: { status: 'ESTIMATE_SENT', estimateSentAt: new Date() },
      include: {
        vehicle: { include: { vendor: { include: { users: { where: { role: { in: ['FLEET_MANAGER','MAINTENANCE_SUPERVISOR'] } }, take: 3 } } } } },
      },
    });

    // Notify vendor contacts
    for (const user of job.vehicle.vendor.users) {
      await sendEmail(user.email, 'estimateReady', {
        name: user.fullName,
        jobNumber: job.jobNumber,
        vehicleVin: job.vehicle.vin,
        totalCost: totalCost.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }),
      });
    }

    await logAction(req, 'ESTIMATE_CREATED', 'Estimate', estimate.id, { jobId, totalCost });
    res.status(201).json({ success: true, data: estimate });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { partsTotal, labourTotal, notes } = req.body;
    const totalCost = parseFloat(partsTotal) + parseFloat(labourTotal);
    const estimate = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { partsTotal: +partsTotal, labourTotal: +labourTotal, totalCost, notes },
    });
    await logAction(req, 'ESTIMATE_UPDATED', 'Estimate', req.params.id);
    res.json({ success: true, data: estimate });
  } catch (err) { next(err); }
};
