const cron = require("cron").CronJob;
const logger = require("../config/logger");

let jobs = [];

function startCronJobs() {
  // Only start cron in production
  if (process.env.NODE_ENV !== "production") {
    logger.info("Cron jobs skipped in non-production environment");
    return;
  }

  try {
    // Monthly fleet report — 1st of each month, 7:00 AM WAT (GROWTH + ENTERPRISE vendors)
    const monthlyReport = new cron('0 7 1 * *', async () => {
      try {
        logger.info('Running monthly fleet maintenance reports...');
        const { sendMonthlyReports } = require('./monthlyReportService');
        const result = await sendMonthlyReports();
        logger.info(`[MONTHLY REPORT] Complete — ${result.sent} sent, ${result.failed} failed`);
      } catch (err) {
        logger.error('Monthly report job failed:', err.message);
      }
    }, null, true, 'Africa/Lagos');
    jobs.push(monthlyReport);
    logger.info('Monthly report cron scheduled (1st of each month, 7 AM WAT)');
  } catch (err) {
    logger.warn('Failed to start monthly report cron:', err.message);
  }

  try {
    const subCheck = new cron("0 1 * * *", async () => {
      try {
        logger.info("Running subscription expiry check...");
        const { checkSubscriptions } = require("./subscriptionChecker");
        await checkSubscriptions();
      } catch (err) {
        logger.error("Subscription check failed:", err.message);
      }
    }, null, true, "Africa/Lagos");
    jobs.push(subCheck);
    logger.info("Subscription cron job scheduled");
  } catch (err) {
    logger.warn("Failed to start subscription cron:", err.message);
  }

  try {
    // Weekly Google Drive backup - Sunday 2:00 AM WAT
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      const backup = new cron("0 2 * * 0", async () => {
        try {
          logger.info("Running weekly Google Drive backup...");
          const { runGoogleDriveBackup } = require("./googleDriveBackup");
          const result = await runGoogleDriveBackup();
          logger.info(`[BACKUP] Complete — ${result.fileName} (${result.sizeKB} KB) in ${result.elapsed}s`);
        } catch (err) {
          logger.error("Google Drive backup failed:", err.message);
        }
      }, null, true, "Africa/Lagos");
      jobs.push(backup);
      logger.info("Google Drive backup cron scheduled (Sundays 2 AM WAT)");
    } else if (process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
      // Fallback: AWS S3 if configured
      const backup = new cron("0 2 * * 0", async () => {
        try {
          logger.info("Running weekly AWS S3 backup...");
          const { runBackup } = require("./backupService");
          await runBackup();
        } catch (err) {
          logger.error("AWS backup failed:", err.message);
        }
      }, null, true, "Africa/Lagos");
      jobs.push(backup);
      logger.info("AWS S3 backup cron scheduled (Sundays 2 AM WAT)");
    } else {
      logger.warn("No backup credentials configured — weekly backup skipped. Add GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY to enable.");
    }
  } catch (err) {
    logger.warn("Failed to start backup cron:", err.message);
  }

  try {
    // Daily purge check - 3:00 AM WAT — permanently delete vendors past their 90-day window
    const purge = new cron("0 3 * * *", async () => {
      try {
        const { PrismaClient } = require("@prisma/client");
        const prisma = new PrismaClient();
        const now = new Date();

        const expired = await prisma.vendor.findMany({
          where: { deletedAt: { not: null }, purgeAt: { lte: now } },
          include: { _count: { select: { users: true, vehicles: true } } },
        });

        for (const vendor of expired) {
          try {
            await prisma.subscription.deleteMany({ where: { vendorId: vendor.id } });
            await prisma.user.deleteMany({ where: { vendorId: vendor.id } });
            await prisma.vehicle.updateMany({ where: { vendorId: vendor.id }, data: { status: "DECOMMISSIONED" } });
            await prisma.vendor.delete({ where: { id: vendor.id } });
            logger.info(`[PURGE] Permanently deleted vendor: ${vendor.companyName} (${vendor.id})`);
          } catch (e) {
            logger.error(`[PURGE] Failed to purge vendor ${vendor.id}:`, e.message);
          }
        }

        if (expired.length > 0) {
          logger.info(`[PURGE] Completed — ${expired.length} vendor(s) permanently removed`);
        }
        await prisma.$disconnect();
      } catch (err) {
        logger.error("Purge job failed:", err.message);
      }
    }, null, true, "Africa/Lagos");
    jobs.push(purge);
    logger.info("Vendor purge cron job scheduled (daily 3 AM WAT)");
  } catch (err) {
    logger.warn("Failed to start purge cron:", err.message);
  }
}

function stopCronJobs() {
  jobs.forEach(job => job.stop());
  jobs = [];
}

module.exports = { startCronJobs, stopCronJobs };