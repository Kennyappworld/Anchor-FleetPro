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
}

function stopCronJobs() {
  jobs.forEach(job => job.stop());
  jobs = [];
}

module.exports = { startCronJobs, stopCronJobs };