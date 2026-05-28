/**
 * Google Drive Backup Service — FleetAnchor Pro
 *
 * Exports all critical database tables as JSON, compresses into a single
 * backup file, and uploads to a dedicated Google Drive folder.
 *
 * Required env vars (set in Railway):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — service account email from Google Cloud
 *   GOOGLE_PRIVATE_KEY            — service account private key (base64-encoded)
 *   GOOGLE_DRIVE_FOLDER_ID        — ID of the Google Drive folder to upload into
 *
 * Setup instructions are in BACKUP-SETUP.md (created alongside this file).
 */

const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const { Readable } = require('stream');
const logger = require('../config/logger');
const { sendEmail } = require('./emailService');

const prisma = new PrismaClient();

// ─── Authenticate with Google using a Service Account ───────────────────────
function getGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const keyBase64 = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !keyBase64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env var not set');
  }

  // Key is stored base64-encoded in Railway to avoid newline escaping issues
  const privateKey = Buffer.from(keyBase64, 'base64').toString('utf8');

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

// ─── Fetch all data from database ───────────────────────────────────────────
async function collectBackupData() {
  const [
    vendors, users, vehicles, jobRequests,
    estimates, invoices, subscriptions, auditLogs,
  ] = await Promise.all([
    prisma.vendor.findMany({ include: { oem: { select: { name: true, tenantId: true } } } }),
    prisma.user.findMany({ select: { id: true, fullName: true, email: true, role: true, vendorId: true, oemId: true, active: true, createdAt: true } }),
    prisma.vehicle.findMany(),
    prisma.jobRequest.findMany(),
    prisma.estimate.findMany(),
    prisma.invoice.findMany(),
    prisma.subscription.findMany(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10000 }),
  ]);

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      exportedBy: 'FleetAnchor Pro Automated Backup',
      version: '1.0',
      counts: {
        vendors: vendors.length,
        users: users.length,
        vehicles: vehicles.length,
        jobRequests: jobRequests.length,
        estimates: estimates.length,
        invoices: invoices.length,
        subscriptions: subscriptions.length,
        auditLogs: auditLogs.length,
      },
    },
    vendors,
    users,
    vehicles,
    jobRequests,
    estimates,
    invoices,
    subscriptions,
    auditLogs,
  };
}

// ─── Upload a buffer to Google Drive ────────────────────────────────────────
async function uploadToDrive(auth, fileName, content, folderId) {
  const drive = google.drive({ version: 'v3', auth });

  // Convert string to readable stream
  const stream = Readable.from([content]);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: stream,
    },
    fields: 'id, name, size, webViewLink',
  });

  return res.data;
}

// ─── Delete backups older than 90 days from Drive folder ────────────────────
async function pruneOldBackups(auth, folderId) {
  if (!folderId) return;
  const drive = google.drive({ version: 'v3', auth });
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const res = await drive.files.list({
    q: `'${folderId}' in parents and name contains 'fleetanchor-backup' and createdTime < '${cutoff}'`,
    fields: 'files(id, name, createdTime)',
  });

  const old = res.data.files || [];
  for (const file of old) {
    await drive.files.delete({ fileId: file.id }).catch(() => {});
    logger.info(`[BACKUP] Pruned old backup: ${file.name}`);
  }
  return old.length;
}

// ─── Main backup function ────────────────────────────────────────────────────
async function runGoogleDriveBackup() {
  const startTime = Date.now();
  logger.info('[BACKUP] Starting Google Drive backup…');

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const notifyEmail = process.env.BACKUP_NOTIFY_EMAIL || process.env.SENDGRID_FROM_EMAIL;

  try {
    // 1. Auth
    const auth = getGoogleAuth();
    await auth.authorize();
    logger.info('[BACKUP] Google auth successful');

    // 2. Collect data
    const data = await collectBackupData();
    const json = JSON.stringify(data, null, 2);
    const sizeKB = Math.round(Buffer.byteLength(json, 'utf8') / 1024);

    // 3. Build filename: fleetanchor-backup-2026-05-29.json
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `fleetanchor-backup-${dateStr}.json`;

    // 4. Upload
    const uploaded = await uploadToDrive(auth, fileName, json, folderId);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.info(`[BACKUP] Uploaded: ${uploaded.name} (${sizeKB} KB) — ${elapsed}s`);

    // 5. Prune old backups
    const pruned = await pruneOldBackups(auth, folderId);

    // 6. Send success email notification
    if (notifyEmail) {
      sendEmail({
        to: notifyEmail,
        subject: `✅ FleetAnchor Pro — Weekly Backup Successful (${dateStr})`,
        html: `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0;text-align:center">
              <div style="font-size:20px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
              <div style="font-size:11px;color:#5A7A99;margin-top:4px">AUTOMATED BACKUP REPORT</div>
            </div>
            <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px">
              <h2 style="color:#1A6A3A;margin-top:0">✅ Backup Completed Successfully</h2>
              <table style="width:100%;font-size:13px;border-collapse:collapse">
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0;width:40%">Date</td><td style="font-weight:600">${dateStr}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">File</td><td style="font-weight:600">${fileName}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">Size</td><td style="font-weight:600">${sizeKB} KB</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">Duration</td><td style="font-weight:600">${elapsed} seconds</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">Vendors</td><td style="font-weight:600">${data.meta.counts.vendors}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">Users</td><td style="font-weight:600">${data.meta.counts.users}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">Vehicles</td><td style="font-weight:600">${data.meta.counts.vehicles}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">Job Requests</td><td style="font-weight:600">${data.meta.counts.jobRequests}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="color:#666;padding:8px 0">Google Drive</td><td><a href="${uploaded.webViewLink || 'https://drive.google.com'}" style="color:#1155CC">View in Drive</a></td></tr>
                ${pruned ? `<tr><td style="color:#666;padding:8px 0">Old backups pruned</td><td style="font-weight:600">${pruned} files removed (&gt;90 days)</td></tr>` : ''}
              </table>
              <p style="font-size:12px;color:#888;margin-top:20px">Next backup: Sunday at 2:00 AM WAT. Backups are retained for 90 days.</p>
            </div>
          </div>
        `,
      }).catch(() => {});
    }

    return { success: true, fileName, sizeKB, elapsed, counts: data.meta.counts, driveLink: uploaded.webViewLink };

  } catch (err) {
    logger.error('[BACKUP] Google Drive backup failed:', err.message);

    // Send failure alert
    if (notifyEmail) {
      sendEmail({
        to: notifyEmail,
        subject: `❌ FleetAnchor Pro — Weekly Backup FAILED`,
        html: `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto">
            <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0;text-align:center">
              <div style="font-size:20px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
            </div>
            <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px">
              <h2 style="color:#C0392B;margin-top:0">❌ Backup Failed</h2>
              <p>The weekly backup to Google Drive failed on <strong>${new Date().toDateString()}</strong>.</p>
              <div style="background:#FEE8E8;border:1px solid #F5C6CB;border-radius:8px;padding:12px;margin:16px 0">
                <code style="font-size:12px;color:#721C24">${err.message}</code>
              </div>
              <p style="font-size:13px">Please check Railway logs and verify your Google Drive credentials are correct.</p>
              <p style="font-size:12px;color:#888">Your data is still safe in Railway's built-in PostgreSQL backups.</p>
            </div>
          </div>
        `,
      }).catch(() => {});
    }

    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

// ─── Manual trigger endpoint (Super Admin) ──────────────────────────────────
async function triggerManualBackup(req, res) {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return res.status(400).json({
        success: false,
        error: 'Google Drive credentials not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_DRIVE_FOLDER_ID to Railway environment variables.',
      });
    }
    const result = await runGoogleDriveBackup();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { runGoogleDriveBackup, triggerManualBackup };
