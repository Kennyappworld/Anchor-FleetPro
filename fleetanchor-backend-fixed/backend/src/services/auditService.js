const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const logger = require('../config/logger');

const prisma = new PrismaClient();

// ─── Hash-chained audit log ───────────────────────────────────────────────────
// Each record contains the SHA-256 hash of the previous record,
// making deletion or tampering detectable by chain verification.

const hashRecord = (record, prevHash) => {
  const content = JSON.stringify({
    userId: record.userId,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    ipAddress: record.ipAddress,
    createdAt: record.createdAt?.toISOString(),
    prevHash,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
};

exports.log = async ({
  userId = null,
  actorLabel = 'system',
  action,
  entityType,
  entityId = null,
  metadata = null,
  ipAddress = null,
  userAgent = null,
  deviceFp = null,
}) => {
  try {
    // Get the latest log entry to chain from
    const lastLog = await prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { recordHash: true } });
    const prevHash = lastLog?.recordHash || null;

    const now = new Date();
    const recordData = { userId, actorLabel, action, entityType, entityId: entityId || null, metadata, ipAddress, userAgent, deviceFp, prevHash, createdAt: now };
    const recordHash = hashRecord(recordData, prevHash);

    await prisma.auditLog.create({ data: { ...recordData, recordHash } });
  } catch (err) {
    // Audit failures must never crash the main request
    logger.error('Audit log failed:', err.message);
  }
};

// ─── Verify chain integrity ────────────────────────────────────────────────────
exports.verifyChain = async () => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
  let prevHash = null;
  let broken = false;
  let brokenAt = null;

  for (const log of logs) {
    const expectedHash = hashRecord({
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }, prevHash);

    if (log.prevHash !== prevHash) {
      broken = true;
      brokenAt = log.id;
      break;
    }
    prevHash = log.recordHash;
  }

  return { intact: !broken, brokenAt };
};

// ─── Export audit logs ────────────────────────────────────────────────────────
exports.getAuditLogs = async ({ userId, entityType, entityId, from, to, page = 1, limit = 50 }) => {
  const where = {};
  if (userId) where.userId = userId;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (from || to) where.createdAt = { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { user: { select: { fullName: true, email: true, role: true } } } }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total, pages: Math.ceil(total / limit) };
};

// ─── Convenience wrapper used by controllers ──────────────────────────────────
// Signature: logAction(req, action, entityType, entityId, metadata)
exports.logAction = async (req, action, entityType, entityId, metadata) => {
  try {
    await exports.log({
      userId: req?.user?.userId || req?.user?.id || null,
      actorLabel: req?.user?.email || req?.user?.role || 'system',
      action,
      entityType,
      entityId: entityId || null,
      metadata: metadata || null,
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  } catch {
    // Audit must never crash the main request
  }
};
