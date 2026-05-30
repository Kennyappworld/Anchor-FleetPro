const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Lazy transporter — built on first use so env vars are always loaded
let _transporter = null;
const getTransporter = () => {
  if (_transporter) return _transporter;
  if (process.env.SENDGRID_API_KEY) {
    _transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
    logger.info('Email: using SendGrid SMTP');
  } else if (process.env.SMTP_HOST) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    logger.info('Email: using custom SMTP');
  } else {
    logger.warn('Email: NO email provider configured — emails will be skipped');
    return null;
  }
  return _transporter;
};

const getFrom = () =>
  `"${process.env.EMAIL_FROM_NAME || 'FleetAnchor Pro'}" <${process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@fleetanchor.com'}>`;

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#333}
  .wrapper{max-width:580px;margin:0 auto;padding:24px 16px}
  .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:#0A1628;padding:24px 28px;text-align:center}
  .logo{font-size:20px;font-weight:800;color:#F5A623;letter-spacing:-0.5px}
  .logo span{color:#00C9A7}
  .body{padding:28px}
  .title{font-size:18px;font-weight:700;margin-bottom:8px}
  .otp-box{background:#0A1628;color:#F5A623;font-size:32px;font-weight:800;letter-spacing:12px;text-align:center;padding:20px;border-radius:8px;margin:20px 0}
  .pill{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .pill-gold{background:#FFF3DC;color:#B8731A}
  .pill-green{background:#E6FAF0;color:#1A7A4A}
  .pill-red{background:#FEE8E8;color:#C0392B}
  .btn{display:inline-block;background:#F5A623;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;margin:16px 0}
  .divider{border:none;border-top:1px solid #eee;margin:20px 0}
  .footer{text-align:center;padding:16px 28px;font-size:11px;color:#888}
  .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0}
  .label{color:#888;font-size:12px}
  .value{font-weight:600;font-size:12px}
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <div class="logo">FleetAnchor <span>Pro</span></div>
      <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:1px">MAINTENANCE MANAGEMENT PLATFORM</div>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      FleetAnchor Pro &middot; <a href="#" style="color:#888">Unsubscribe</a> &middot; <a href="#" style="color:#888">Privacy Policy</a><br>
      This is an automated message. Do not reply directly to this email.
    </div>
  </div>
</div>
</body>
</html>`;

const send = async ({ to, subject, html }) => {
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn(`Email skipped (no provider): ${subject} → ${to}`);
    return false;
  }
  const from = getFrom();
  logger.info(`Email attempting: "${subject}" → ${to} | from: ${from} | key starts: ${(process.env.SENDGRID_API_KEY||'').slice(0,10)}...`);
  try {
    const info = await transporter.sendMail({ from, to, subject, html });
    logger.info(`Email sent OK: ${subject} → ${to} [${info.messageId || 'no-id'}]`);
    return true;
  } catch (err) {
    logger.error(`Email FAILED: ${subject} → ${to} | Error: ${err.message} | Code: ${err.code} | Response: ${err.response || ''}`);
    _transporter = null;
    return false;
  }
};

// ─── GENERIC SEND ─────────────────────────────────────────────────────────────
exports.sendEmail = ({ to, subject, html }) => send({ to, subject, html });

// ─── PASSWORD RESET ───────────────────────────────────────────────────────────
exports.sendPasswordReset = ({ to, name, otp }) => send({
  to,
  subject: 'FleetAnchor Pro — Password Reset Code',
  html: baseTemplate(`
    <div class="title">Reset your password</div>
    <p>Hi ${name},</p>
    <p>Use the code below to reset your FleetAnchor Pro password:</p>
    <div class="otp-box">${otp}</div>
    <p style="font-size:12px;color:#888;text-align:center">This code expires in <strong>15 minutes</strong>.</p>
    <hr class="divider">
    <p style="font-size:12px;color:#888">If you didn't request this, you can safely ignore this email.</p>
  `),
});

// ─── WELCOME EMAIL ────────────────────────────────────────────────────────────
exports.sendWelcome = ({ to, name, role, tempPassword }) => send({
  to,
  subject: 'Welcome to FleetAnchor Pro — Your account is ready',
  html: baseTemplate(`
    <div class="title">Welcome to FleetAnchor Pro</div>
    <p>Hi ${name},</p>
    <p>Your account has been created. Here are your login details:</p>
    <div class="row"><span class="label">Email</span><span class="value">${to}</span></div>
    <div class="row"><span class="label">Temporary Password</span><span class="value">${tempPassword}</span></div>
    <div class="row"><span class="label">Role</span><span class="value"><span class="pill pill-gold">${role.replace(/_/g, ' ')}</span></span></div>
    <br>
    <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/login" class="btn">Login to FleetAnchor Pro</a>
    <p style="font-size:12px;color:#888">Please change your password after first login.</p>
  `),
});

// ─── JOB SUBMITTED ────────────────────────────────────────────────────────────
exports.sendJobSubmittedNotification = async ({ job }) => {
  
  const staff = await prisma.user.findMany({ where: { oemId: job.vehicle?.vendor?.oemId, role: { in: ['OEM_ADMIN', 'WORKSHOP_STAFF'] }, active: true } });
  for (const s of staff) {
    await send({
      to: s.email,
      subject: `New Job Request — ${job.jobNumber}`,
      html: baseTemplate(`
        <div class="title">New Job Request</div>
        <div class="row"><span class="label">Job Number</span><span class="value">${job.jobNumber}</span></div>
        <div class="row"><span class="label">Vehicle</span><span class="value">${job.vehicle?.vin} · ${job.vehicle?.plateNumber}</span></div>
        <div class="row"><span class="label">Vendor</span><span class="value">${job.vehicle?.vendor?.companyName}</span></div>
        <div class="row"><span class="label">Category</span><span class="value">${job.category}</span></div>
        <a href="${process.env.FRONTEND_URL}/jobs/${job.id}" class="btn">View Job Request</a>
      `),
    });
  }
};

// ─── ESTIMATE READY ───────────────────────────────────────────────────────────
exports.sendEstimateReady = async ({ job, vendorEmails }) => {
  for (const email of vendorEmails) {
    await send({
      to: email,
      subject: `Estimate Ready for Review — Job ${job.jobNumber}`,
      html: baseTemplate(`
        <div class="title">Estimate Ready for Your Approval</div>
        <p>An estimate has been prepared for job <strong>${job.jobNumber}</strong>. Please review and approve or query it.</p>
        <a href="${process.env.FRONTEND_URL}/jobs/${job.id}" class="btn">Review Estimate</a>
      `),
    });
  }
};

// ─── REPAIR COMPLETE ──────────────────────────────────────────────────────────
exports.sendRepairComplete = async ({ job, vendorEmails }) => {
  for (const email of vendorEmails) {
    await send({
      to: email,
      subject: `Vehicle Ready for Pickup — ${job.vehicle?.plateNumber}`,
      html: baseTemplate(`
        <div class="title">Your vehicle is ready for pickup</div>
        <div class="row"><span class="label">Vehicle</span><span class="value">${job.vehicle?.make} ${job.vehicle?.model} · ${job.vehicle?.plateNumber}</span></div>
        <div class="row"><span class="label">Job Number</span><span class="value">${job.jobNumber}</span></div>
        <div class="row"><span class="label">Status</span><span class="value"><span class="pill pill-green">Repair Complete</span></span></div>
        <p>Please arrange payment and collection. An invoice has been generated.</p>
        <a href="${process.env.FRONTEND_URL}/invoices?job=${job.id}" class="btn">View Invoice</a>
      `),
    });
  }
};

// ─── SUBSCRIPTION EXPIRY WARNING ─────────────────────────────────────────────
exports.sendSubscriptionExpiry = async ({ to, name, daysLeft, plan }) => send({
  to,
  subject: `FleetAnchor Pro — Subscription expires in ${daysLeft} days`,
  html: baseTemplate(`
    <div class="title">Subscription Expiry Notice</div>
    <p>Hi ${name},</p>
    <p>Your <strong>${plan}</strong> subscription expires in <strong>${daysLeft} days</strong>.</p>
    <a href="${process.env.FRONTEND_URL}/subscription" class="btn">Renew Subscription</a>
  `),
});

// ─── ACCOUNT SUSPENDED ────────────────────────────────────────────────────────
exports.sendAccountSuspended = async ({ to, name, reason }) => send({
  to,
  subject: 'FleetAnchor Pro — Account Suspended',
  html: baseTemplate(`
    <div class="title" style="color:#E84B4B">Account Suspended</div>
    <p>Hi ${name},</p>
    <p>Your FleetAnchor Pro account has been suspended.</p>
    <div class="row"><span class="label">Reason</span><span class="value">${reason || 'Policy violation or non-payment'}</span></div>
    <p>Please contact <a href="mailto:support@fleetanchor.com">support@fleetanchor.com</a></p>
  `),
});
