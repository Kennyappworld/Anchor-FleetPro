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
    // Daily service alert check - 8:00 AM WAT (batched, grouped by vendor)
    const serviceAlert = new cron('0 8 * * *', async () => {
      try {
        logger.info('Running preventive maintenance alert check (batched)...');
        const { checkServiceAlertsBatched } = require('./complianceAlertService');
        const result = await checkServiceAlertsBatched();
        logger.info(`[SERVICE ALERT] Complete -- ${result.alerted} vehicles alerted`);
      } catch (err) {
        logger.error('Service alert check failed:', err.message);
      }
    }, null, true, 'Africa/Lagos');
    jobs.push(serviceAlert);
    logger.info('Service alert cron scheduled (daily 8 AM WAT, batched)');
  } catch (err) {
    logger.warn('Failed to start service alert cron:', err.message);
  }

  try {
    // Daily document compliance alert - 8:30 AM WAT
    const complianceAlert = new cron('30 8 * * *', async () => {
      try {
        logger.info('Running document compliance alert check...');
        const { checkComplianceAlerts } = require('./complianceAlertService');
        const result = await checkComplianceAlerts();
        logger.info(`[COMPLIANCE ALERT] Complete -- ${result.sent} vendor batches sent`);
      } catch (err) {
        logger.error('Compliance alert check failed:', err.message);
      }
    }, null, true, 'Africa/Lagos');
    jobs.push(complianceAlert);
    logger.info('Compliance alert cron scheduled (daily 8:30 AM WAT)');
  } catch (err) {
    logger.warn('Failed to start compliance alert cron:', err.message);
  }

  try {
    // Daily subscription check - 1:00 AM WAT
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
// exported so it can be called manually in tests
async function checkServiceAlerts() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const { sendEmail } = require('./emailService');
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Find vehicles due by date (within 30 days) OR overdue, alert not yet sent
  const byDate = await prisma.vehicle.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: undefined,
      nextServiceDate: { lte: in30Days },
      serviceAlertSent: false,
    },
    include: { vendor: { include: { users: { where: { role: 'FLEET_MANAGER', active: true }, take: 1 } } } },
  });

  // Find vehicles due by odometer (within 700 km), alert not yet sent
  const byOdo = await prisma.vehicle.findMany({
    where: {
      status: 'ACTIVE',
      nextServiceOdometer: { not: null },
      serviceAlertSent: false,
      currentOdometer: { not: null },
    },
    include: { vendor: { include: { users: { where: { role: 'FLEET_MANAGER', active: true }, take: 1 } } } },
  });

  const odoAlerts = byOdo.filter(v =>
    v.nextServiceOdometer - v.currentOdometer <= 700
  );

  // Merge by id, deduplicate
  const alertMap = {};
  [...byDate, ...odoAlerts].forEach(v => { alertMap[v.id] = v; });
  const toAlert = Object.values(alertMap);

  logger.info(`[SERVICE ALERT] ${toAlert.length} vehicles due for service`);

  for (const v of toAlert) {
    const email = v.vendor?.users?.[0]?.email || v.vendor?.contactEmail;
    if (!email) continue;

    const daysUntil = v.nextServiceDate
      ? Math.ceil((new Date(v.nextServiceDate) - now) / (1000 * 60 * 60 * 24))
      : null;
    const kmUntil = v.nextServiceOdometer && v.currentOdometer
      ? v.nextServiceOdometer - v.currentOdometer
      : null;

    const isOverdueDate = daysUntil !== null && daysUntil < 0;
    const isOverdueKm   = kmUntil !== null && kmUntil < 0;

    const urgencyColor = (isOverdueDate || isOverdueKm) ? '#E84B4B' : daysUntil <= 7 ? '#F5A623' : '#1A7A4A';
    const urgencyLabel = (isOverdueDate || isOverdueKm) ? '🚨 OVERDUE' : daysUntil <= 7 ? '⚠️ DUE SOON' : '📅 UPCOMING';

    await sendEmail({
      to: email,
      subject: `${urgencyLabel} — Service Due: ${v.plateNumber} (${v.make} ${v.model})`,
      html: `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif">
      <div style="max-width:600px;margin:0 auto;padding:24px 16px">
        <div style="background:#0A1628;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
          <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:2px">PREVENTIVE MAINTENANCE ALERT</div>
        </div>
        <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;box-shadow:0 4px 12px rgba(0,0,0,.08)">
          <div style="background:${urgencyColor};color:#fff;padding:10px 16px;border-radius:8px;font-weight:700;font-size:14px;margin-bottom:20px;text-align:center">
            ${urgencyLabel} — Scheduled Service Required
          </div>
          <h2 style="margin:0 0 16px;font-size:16px;color:#0A1628">${v.make} ${v.model} ${v.year} · <span style="color:#F5A623">${v.plateNumber}</span></h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
            ${daysUntil !== null ? `
            <tr style="background:#F8FAFC">
              <td style="padding:10px 12px;color:#666">Next Service Date</td>
              <td style="padding:10px 12px;font-weight:700;color:${urgencyColor}">
                ${new Date(v.nextServiceDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                ${isOverdueDate ? ` <span style="background:#FEE8E8;color:#C0392B;padding:2px 8px;border-radius:4px;font-size:11px">${Math.abs(daysUntil)} days OVERDUE</span>`
                  : ` <span style="background:#FFF3DC;color:#B8731A;padding:2px 8px;border-radius:4px;font-size:11px">in ${daysUntil} days</span>`}
              </td>
            </tr>` : ''}
            ${kmUntil !== null ? `
            <tr>
              <td style="padding:10px 12px;color:#666">Odometer at Service</td>
              <td style="padding:10px 12px;font-weight:700;color:${isOverdueKm ? '#E84B4B' : '#0A1628'}">
                ${v.nextServiceOdometer?.toLocaleString()} km
                ${isOverdueKm ? ` <span style="background:#FEE8E8;color:#C0392B;padding:2px 8px;border-radius:4px;font-size:11px">${Math.abs(kmUntil)} km OVERDUE</span>`
                  : ` <span style="background:#E6FAF0;color:#1A7A4A;padding:2px 8px;border-radius:4px;font-size:11px">${kmUntil} km remaining</span>`}
              </td>
            </tr>` : ''}
            <tr style="background:#F8FAFC">
              <td style="padding:10px 12px;color:#666">Current Odometer</td>
              <td style="padding:10px 12px;font-weight:600">${v.currentOdometer ? v.currentOdometer.toLocaleString() + ' km' : 'Not recorded'}</td>
            </tr>
            <tr>
              <td style="padding:10px 12px;color:#666">Last Service</td>
              <td style="padding:10px 12px;font-weight:600">
                ${v.lastServiceDate ? new Date(v.lastServiceDate).toLocaleDateString('en-NG') : 'Not recorded'}
                ${v.lastServiceOdometer ? ` at ${v.lastServiceOdometer.toLocaleString()} km` : ''}
              </td>
            </tr>
            <tr style="background:#F8FAFC">
              <td style="padding:10px 12px;color:#666">Service Interval</td>
              <td style="padding:10px 12px;font-weight:600">
                ${v.serviceIntervalDays ? `Every ${v.serviceIntervalDays} days` : ''}
                ${v.serviceIntervalDays && v.serviceIntervalKm ? ' / ' : ''}
                ${v.serviceIntervalKm ? `Every ${v.serviceIntervalKm.toLocaleString()} km` : ''}
              </td>
            </tr>
          </table>
          <div style="text-align:center">
            <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/vendor/vehicles"
               style="background:#F5A623;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block">
              Submit Service Job Request →
            </a>
          </div>
          <p style="font-size:11px;color:#999;text-align:center;margin-top:16px">
            After servicing, update the odometer and last service date in your vehicles dashboard to reset this alert.
          </p>
        </div>
      </div>
      </body></html>`,
    });

    await prisma.vehicle.update({
      where: { id: v.id },
      data: { serviceAlertSent: true },
    });
  }

  await prisma.$disconnect();
  return { alerted: toAlert.length };
}

module.exports.checkServiceAlerts = checkServiceAlerts;
