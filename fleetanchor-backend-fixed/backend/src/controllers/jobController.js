const logger = require('../config/logger');
const prisma = require('../config/prisma');
const auditService = require('../services/auditService');
const emailService = require('../services/emailService');
const { generateJobNumber } = require('../utils/generators');
const { jobWhere, vehicleWhere, isSuper, isOem } = require('../utils/tenant');
const clientIp = require('../utils/clientIp');

// Workshop side moves a job through repair; the fleet side only closes or cancels via estimate response.
const WORKSHOP_ROLES = ['SUPER_ADMIN', 'OEM_ADMIN', 'WORKSHOP_STAFF'];

exports.create = async (req, res) => {
  try {
    const { vehicleId, category, description, priority } = req.body;

    // Validate vehicle belongs to caller's vendor
    // `vendorId: undefined` meant "any vendor" for users without one.
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, ...vehicleWhere(req.user) },
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
    emailService.sendJobSubmittedNotification({ job }).catch(() => {});

    await auditService.log({ userId: req.user.userId, action: 'JOB_CREATED', entityType: 'job', entityId: job.id, ipAddress: clientIp(req), actorLabel: req.user.email });

    return res.status(201).json({ success: true, job });
  } catch (err) {
    logger.error('Create job error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.list = async (req, res) => {
  try {
    const { status, vehicleId, vendorId, page = 1, limit = 20, search } = req.query;
    const take = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;
    const where = { ...jobWhere(req.user) };

    if (status) where.status = String(status);
    if (vehicleId) where.vehicleId = String(vehicleId);
    if (search) {
      const search = String(req.query.search).slice(0, 100);
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
        skip: Math.max(skip, 0) || 0,
        take,
      }),
      prisma.jobRequest.count({ where }),
    ]);

    return res.json({ success: true, jobs, pagination: { total, page: parseInt(page) || 1, limit: take, pages: Math.ceil(total / take) } });
  } catch (err) {
    logger.error('List jobs error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.get = async (req, res) => {
  try {
    const job = await prisma.jobRequest.findFirst({
      where: { id: req.params.id, ...jobWhere(req.user) },
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

    const job = await prisma.jobRequest.findFirst({ where: { id, ...jobWhere(req.user) }, include: { vehicle: { include: { vendor: { include: { users: true } } } } } });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    // Only the workshop moves a job through repair stages; a fleet can only close its own job.
    const internal = req._internalStatusChange === true;
    if (!internal && !WORKSHOP_ROLES.includes(req.user.role) && status !== 'CLOSED') {
      return res.status(403).json({ success: false, error: 'Only the workshop can change this job status' });
    }
    // Estimate approval belongs to the fleet (POST /:id/estimate-response); the
    // workshop must not be able to approve its own estimate.
    if (!internal && ['ESTIMATE_APPROVED', 'ESTIMATE_QUERIED'].includes(status) && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'The fleet manager approves or queries the estimate' });
    }
    const changed = status !== job.status;
    if (technicianId) {
      const tech = await prisma.user.findFirst({ where: { id: String(technicianId), role: 'WORKSHOP_STAFF', ...(isSuper(req.user) ? {} : { oemId: req.user.oemId || '00000000-0000-0000-0000-000000000000' }) } });
      if (!tech) return res.status(400).json({ success: false, error: 'Technician not found' });
    }

    const updateData = { status };
    const now = new Date();
    if (changed) {

    // Set timestamps per status transition
    if (status === 'DIAGNOSED') updateData.diagnosedAt = now;
    if (status === 'ESTIMATE_SENT') updateData.estimateSentAt = now;
    if (status === 'ESTIMATE_APPROVED') updateData.approvedAt = now;
    if (status === 'REPAIR_STARTED') updateData.repairStartAt = now;
    if (status === 'REPAIR_COMPLETE') updateData.completedAt = now;
    if (status === 'CLOSED') updateData.closedAt = now;
    }
    if (bayNumber) updateData.bayNumber = bayNumber;
    if (technicianId) updateData.technicianId = technicianId;

    const updated = await prisma.jobRequest.update({ where: { id }, data: updateData });

    await prisma.jobTimeline.create({
      data: { jobId: id, status, actorId: req.user.userId, actorName: req.user.email, note: note ? String(note).slice(0, 1000) : null },
    });

    // Send notifications only when the status actually changes (adding a note must not re-send emails)
    if (changed && status === 'ESTIMATE_SENT') {
      const vendorEmails = job.vehicle.vendor.users
        .filter(u => ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR'].includes(u.role))
        .map(u => u.email);
      emailService.sendEstimateReady({ job, vendorEmails }).catch(() => {});
    }

    if (changed && status === 'REPAIR_COMPLETE') {
      const vendorEmails = job.vehicle.vendor.users.filter(u => u.role === 'FLEET_MANAGER').map(u => u.email);
      emailService.sendRepairComplete({ job, vendorEmails }).catch(() => {});
    }

    await auditService.log({ userId: req.user.userId, action: `JOB_STATUS_${status}`, entityType: 'job', entityId: id, ipAddress: clientIp(req), actorLabel: req.user.email });

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

    // The job must belong to the caller's own fleet.
    const job = await prisma.jobRequest.findFirst({ where: { id, ...jobWhere(req.user) }, select: { id: true } });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const estimate = await prisma.estimate.findFirst({ where: { jobId: id }, orderBy: { revision: 'desc' } });
    if (!estimate) return res.status(404).json({ success: false, error: 'No estimate found for this job' });
    if (estimate.status !== 'PENDING' && estimate.status !== 'QUERIED') {
      return res.status(409).json({ success: false, error: `Estimate is already ${String(estimate.status).toLowerCase()}` });
    }

    if (action === 'approve') {
      await prisma.estimate.update({ where: { id: estimate.id }, data: { status: 'APPROVED', approvedAt: new Date() } });
      await exports.updateStatus({ params: { id }, body: { status: 'ESTIMATE_APPROVED', note: 'Estimate approved by vendor' }, user: req.user, ip: clientIp(req), _internalStatusChange: true }, res);
    } else if (action === 'query') {
      await prisma.estimate.update({ where: { id: estimate.id }, data: { status: 'QUERIED', queryNote } });
      await prisma.jobRequest.update({ where: { id }, data: { status: 'ESTIMATE_QUERIED' } });
      await prisma.jobTimeline.create({ data: { jobId: id, status: 'ESTIMATE_QUERIED', actorId: req.user.userId, actorName: req.user.email, note: `Queried: ${String(queryNote || '').slice(0, 1000)}` } });
      return res.json({ success: true, message: 'Estimate queried. Workshop has been notified.' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.vehicleHistory = async (req, res) => {
  try {
    const { vin, plateNumber } = req.query;

    if (!vin && !plateNumber) return res.status(400).json({ success: false, error: 'vin or plateNumber required' });
    const vehicle = await prisma.vehicle.findFirst({
      where: { ...(vin ? { vin: String(vin) } : { plateNumber: String(plateNumber) }), ...vehicleWhere(req.user) },
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
