const logger = require('../config/logger');
const prisma = require('../config/prisma');
const auditService = require('../services/auditService');
const { sendEmail } = require('../services/emailService');

exports.create = async (req, res) => {
  try {
    const { vehicleId, category, description, priority } = req.body;

    // Validate vehicle belongs to caller's vendor
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, vendorId: req.user.vendorId || undefined },
      include: { vendor: { include: { users: { where: { role: { in: ['FLEET_MANAGER', 'OEM_ADMIN'] } } } } } },
    });

    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found or access denied' });

    const jobNumber = await generateJobNumber();

    const job = await prisma.jobRequest.create({
      data: {
        jobNumber,
        vehicleId,
        createdById: req.user.userId,
        category,
        description,
        priority: priority || 'NORMAL',
        status: 'SUBMITTED',
      },
      include: { vehicle: { include: { vendor: true } }, createdBy: true },
    });

    // Log timeline
    await prisma.jobTimeline.create({
      data: { jobId: job.id, status: 'SUBMITTED', actorId: req.user.userId, actorName: req.user.email, note: 'Job request submitted' },
    });

    // Notify workshop staff
    await emailService.sendJobSubmittedNotification({ job });

    await auditService.log({ userId: req.user.userId, action: 'JOB_CREATED', entityType: 'job', entityId: job.id, ipAddress: req.ip, actorLabel: req.user.email });

    return res.status(201).json({ success: true, job });
  } catch (err) {
    logger.error('Create job error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.list = async (req, res) => {
  try {
    const { status, vehicleId, vendorId, page = 1, limit = 20, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let where = {};

    // Scope: field agents see only their vendor's jobs
    if (req.user.role === 'FIELD_AGENT' || req.user.role === 'FLEET_MANAGER' || req.user.role === 'MAINTENANCE_SUPERVISOR') {
      where.vehicle = { vendorId: req.user.vendorId };
    } else if (req.user.role === 'OEM_ADMIN' || req.user.role === 'WORKSHOP_STAFF') {
      where.vehicle = { vendor: { oemId: req.user.oemId } };
    }

    if (status) where.status = status;
    if (vehicleId) where.vehicleId = vehicleId;
    if (search) {
      where.OR = [
        { jobNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { vehicle: { vin: { contains: search, mode: 'insensitive' } } },
        { vehicle: { plateNumber: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.jobRequest.findMany({
        where,
        include: {
          vehicle: { select: { vin: true, plateNumber: true, make: true, model: true, vendor: { select: { companyName: true } } } },
          createdBy: { select: { fullName: true, email: true } },
          estimates: { orderBy: { revision: 'desc' }, take: 1 },
          invoices: { take: 1 },
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.jobRequest.count({ where }),
    ]);

    return res.json({ success: true, jobs, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    logger.error('List jobs error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const job = await prisma.jobRequest.findUnique({
      where: { id: req.params.id },
      include: {
        vehicle: { include: { vendor: true } },
        createdBy: { select: { fullName: true, email: true } },
        timelines: { orderBy: { createdAt: 'asc' } },
        estimates: { orderBy: { revision: 'desc' } },
        invoices: true,
      },
    });

    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
    return res.json({ success: true, job });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status, note, bayNumber, technicianId } = req.body;
    const { id } = req.params;

    const job = await prisma.jobRequest.findUnique({ where: { id }, include: { vehicle: { include: { vendor: { include: { users: true } } } } } });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const updateData = { status };
    const now = new Date();

    // Set timestamps per status transition
    if (status === 'DIAGNOSED') updateData.diagnosedAt = now;
    if (status === 'ESTIMATE_SENT') updateData.estimateSentAt = now;
    if (status === 'ESTIMATE_APPROVED') updateData.approvedAt = now;
    if (status === 'REPAIR_STARTED') updateData.repairStartAt = now;
    if (status === 'REPAIR_COMPLETE') updateData.completedAt = now;
    if (status === 'CLOSED') updateData.closedAt = now;
    if (bayNumber) updateData.bayNumber = bayNumber;
    if (technicianId) updateData.technicianId = technicianId;

    const updated = await prisma.jobRequest.update({ where: { id }, data: updateData });

    await prisma.jobTimeline.create({
      data: { jobId: id, status, actorId: req.user.userId, actorName: req.user.email, note },
    });

    // Send notifications based on status
    if (status === 'ESTIMATE_SENT') {
      const vendorEmails = job.vehicle.vendor.users
        .filter(u => ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR'].includes(u.role))
        .map(u => u.email);
      await emailService.sendEstimateReady({ job, vendorEmails });
    }

    if (status === 'REPAIR_COMPLETE') {
      const vendorEmails = job.vehicle.vendor.users.filter(u => u.role === 'FLEET_MANAGER').map(u => u.email);
      await emailService.sendRepairComplete({ job, vendorEmails });
    }

    await auditService.log({ userId: req.user.userId, action: `JOB_STATUS_${status}`, entityType: 'job', entityId: id, ipAddress: req.ip, actorLabel: req.user.email });

    return res.json({ success: true, job: updated });
  } catch (err) {
    logger.error('Update job status error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.respondToEstimate = async (req, res) => {
  try {
    const { action, queryNote } = req.body; // action: 'approve' | 'query'
    const { id } = req.params;

    if (!['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only fleet managers can approve/query estimates' });
    }

    const estimate = await prisma.estimate.findFirst({ where: { jobId: id }, orderBy: { revision: 'desc' } });
    if (!estimate) return res.status(404).json({ success: false, error: 'No estimate found for this job' });

    if (action === 'approve') {
      await prisma.estimate.update({ where: { id: estimate.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
      await exports.updateStatus({ params: { id }, body: { status: 'ESTIMATE_APPROVED', note: 'Estimate approved by vendor' }, user: req.user, ip: req.ip }, res);
    } else if (action === 'query') {
      await prisma.estimate.update({ where: { id: estimate.id }, data: { status: 'QUERIED', queryNote } });
      await prisma.jobRequest.update({ where: { id }, data: { status: 'ESTIMATE_QUERIED' } });
      await prisma.jobTimeline.create({ data: { jobId: id, status: 'ESTIMATE_QUERIED', actorId: req.user.userId, actorName: req.user.email, note: `Queried: ${queryNote}` } });
      return res.json({ success: true, message: 'Estimate queried. Workshop has been notified.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.vehicleHistory = async (req, res) => {
  try {
    const { vin, plateNumber } = req.query;

    const vehicle = await prisma.vehicle.findFirst({
      where: vin ? { vin } : { plateNumber },
      include: { vendor: { select: { companyName: true } } },
    });

    if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    // Field agents see status but not costs
    const isFieldAgent = req.user.role === 'FIELD_AGENT';

    const jobs = await prisma.jobRequest.findMany({
      where: { vehicleId: vehicle.id },
      include: {
        timelines: { orderBy: { createdAt: 'asc' } },
        estimates: { orderBy: { revision: 'desc' }, take: 1 },
        invoices: !isFieldAgent ? true : false,
      },
      orderBy: { submittedAt: 'desc' },
    });

    const history = jobs.map(job => ({
      id: job.id,
      jobNumber: job.jobNumber,
      category: job.category,
      description: job.description,
      status: job.status,
      submittedAt: job.submittedAt,
      completedAt: job.completedAt,
      cost: isFieldAgent ? undefined : job.invoices?.[0]?.totalAmount || job.estimates?.[0]?.totalCost || null,
    }));

    return res.json({ success: true, vehicle, history, totalJobs: history.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};
