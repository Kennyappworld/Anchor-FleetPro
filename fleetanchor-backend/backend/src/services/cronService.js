const { CronJob } = require('cron');
const { PrismaClient } = require('@prisma/client');
const { exec } = require('child_process');
const { promisify } = require('util');
const emailService = require('./emailService');
const auditService = require('./auditService');
const logger = require('../config/logger');

const prisma = new PrismaClient();
const execAsync = promisify(exec);

// ─── SUBSCRIPTION EXPIRY CHECKER ─────────────────────────────────────────────
const checkSubscriptions = async () => {
  logger.info('[CRON] Running subscription expiry check...');
  try {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Find subscriptions expiring within 7 days
    const expiring7 = await prisma.subscription.findMany({
      where: { expiryDate: { lte: in7Days, gte: in3Days }, status: 'ACTIVE', warningAt7Days: false },
      include: { vendor: { include: { users: { where: { role: 'FLEET_MANAGER', active: true } } } } },
    });

    for (const sub of expiring7) {
      const daysLeft = Math.ceil((sub.expiryDate - now) / (1000 * 60 * 60 * 24));
      for (const user of sub.vendor.users) {
        await emailService.sendSubscriptionExpiry({ to: user.email, name: user.fullName, daysLeft, plan: sub.plan });
      }
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRING', warningAt7Days: true } });
      logger.info(`[CRON] 7-day expiry warning sent for vendor ${sub.vendorId}`);
    }

    // Find subscriptions expiring within 3 days
    const expiring3 = await prisma.subscription.findMany({
      where: { expiryDate: { lte: in3Days, gte: now }, warningAt3Days: false },
      include: { vendor: { include: { users: { where: { role: 'FLEET_MANAGER', active: true } } } } },
    });

    for (const sub of expiring3) {
      const daysLeft = Math.ceil((sub.expiryDate - now) / (1000 * 60 * 60 * 24));
      for (const user of sub.vendor.users) {
        await emailService.sendSubscriptionExpiry({ to: user.email, name: user.fullName, daysLeft, plan: sub.plan });
      }
      await prisma.subscription.update({ where: { id: sub.id }, data: { warningAt3Days: true } });
      logger.info(`[CRON] 3-day expiry warning sent for vendor ${sub.vendorId}`);
    }

    // Expire overdue subscriptions
    const expired = await prisma.subscription.findMany({
      where: { expiryDate: { lt: now }, status: { in: ['ACTIVE', 'EXPIRING'] } },
      include: { vendor: { include: { users: { where: { role: 'FLEET_MANAGER', active: true } } } } },
    });

    for (const sub of expired) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
      await prisma.vendor.update({ where: { id: sub.vendorId }, data: { status: 'EXPIRED' } });
      for (const user of sub.vendor.users) {
        await emailService.sendAccountSuspended({ to: user.email, name: user.fullName, reason: 'Subscription expired' });
      }
      await auditService.log({ actorLabel: 'cron', action: 'SUBSCRIPTION_EXPIRED', entityType: 'subscription', entityId: sub.id });
      logger.warn(`[CRON] Vendor ${sub.vendorId} subscription expired and account suspended`);
    }

    logger.info('[CRON] Subscription check complete');
  } catch (err) {
    logger.error('[CRON] Subscription check failed:', err.message);
  }
};

// ─── WEEKLY DATABASE BACKUP ───────────────────────────────────────────────────
const runWeeklyBackup = async () => {
  logger.info('[CRON] Starting weekly database backup...');
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `fleetanchor-backup-${timestamp}.sql`;
    const encryptedFilename = `${filename}.gpg`;
    const tmpPath = `/tmp/${filename}`;
    const encryptedPath = `/tmp/${encryptedFilename}`;

    // Dump database
    const dbUrl = process.env.DATABASE_URL;
    await execAsync(`pg_dump "${dbUrl}" > ${tmpPath}`);
    logger.info(`[CRON] Database dumped to ${tmpPath}`);

    // Encrypt with GPG
    const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
    await execAsync(`gpg --batch --yes --passphrase "${passphrase}" --symmetric --cipher-algo AES256 ${tmpPath}`);
    logger.info('[CRON] Backup encrypted');

    // Upload to S3
    const s3Bucket = process.env.AWS_S3_BUCKET;
    const s3Key = `weekly-backups/${new Date().getFullYear()}/${encryptedFilename}`;
    await execAsync(`aws s3 cp ${encryptedPath} s3://${s3Bucket}/${s3Key} --region ${process.env.AWS_REGION}`);
    logger.info(`[CRON] Backup uploaded to s3://${s3Bucket}/${s3Key}`);

    // Cleanup temp files
    await execAsync(`rm -f ${tmpPath} ${encryptedPath}`);

    // Verify backup
    const { stdout } = await execAsync(`aws s3 ls s3://${s3Bucket}/${s3Key}`);
    const sizeMatch = stdout.match(/\d+/);
    const sizeBytes = sizeMatch ? parseInt(sizeMatch[0]) : 0;

    await auditService.log({
      actorLabel: 'cron',
      action: 'WEEKLY_BACKUP_COMPLETED',
      entityType: 'system',
      metadata: { s3Key, sizeBytes, timestamp },
    });

    logger.info(`[CRON] Weekly backup complete — ${s3Key} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
  } catch (err) {
    logger.error('[CRON] Weekly backup FAILED:', err.message);
    await auditService.log({ actorLabel: 'cron', action: 'WEEKLY_BACKUP_FAILED', entityType: 'system', metadata: { error: err.message } });
  }
};

// ─── START CRON JOBS ─────────────────────────────────────────────────────────
exports.startCronJobs = () => {
  // Subscription check — daily at 08:00
  new CronJob(process.env.SUBSCRIPTION_CHECK_CRON || '0 8 * * *', checkSubscriptions, null, true, 'Africa/Lagos');
  logger.info('[CRON] Subscription checker scheduled: daily 08:00 WAT');

  // Weekly backup — Sunday at 02:00
  new CronJob(process.env.BACKUP_CRON_SCHEDULE || '0 2 * * 0', runWeeklyBackup, null, true, 'Africa/Lagos');
  logger.info('[CRON] Weekly backup scheduled: Sunday 02:00 WAT');
};

exports.checkSubscriptions = checkSubscriptions;
exports.runWeeklyBackup = runWeeklyBackup;
