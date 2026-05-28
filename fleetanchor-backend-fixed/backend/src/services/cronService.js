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
    // Daily subscription check - 1:00 AM WAT
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
    // Weekly backup - Sunday 2:00 AM WAT
    if (process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID) {
      const backup = new cron("0 2 * * 0", async () => {
        try {
          logger.info("Running weekly backup...");
          const { runBackup } = require("./backupService");
          await runBackup();
        } catch (err) {
          logger.error("Backup failed:", err.message);
        }
      }, null, true, "Africa/Lagos");
      jobs.push(backup);
      logger.info("Backup cron job scheduled");
    } else {
      logger.warn("AWS credentials not configured - backup cron skipped");
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