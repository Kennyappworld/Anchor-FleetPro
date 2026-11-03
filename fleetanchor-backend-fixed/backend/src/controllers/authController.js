const logger = require('../config/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { totp } = require('otplib');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const auditService = require('../services/auditService');
const emailService = require('../services/emailService');
const { escHtml } = require('../utils/sanitize');
const { userWhere, isSuper, outranks } = require('../utils/tenant');

const JWT_ALGS = ['HS256'];
const MAX_OTP_TRIES = 5;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const signAccess = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '15m' });

const signRefresh = (payload) =>
  jwt.sign({ ...payload, typ: 'refresh' }, process.env.JWT_REFRESH_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

// Constant-time string comparison (avoids leaking how many characters matched).
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const issueTokens = (user) => ({
  accessToken: signAccess({ userId: user.id, email: user.email, role: user.role, vendorId: user.vendorId, oemId: user.oemId }),
  refreshToken: signRefresh({ userId: user.id }),
});

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

exports.login = async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;
    const ip = req.ip;
    const ua = req.headers['user-agent'];

    const user = await prisma.user.findUnique({
      where: { email },
      include: { vendor: true, oem: true },
    });

    if (!user || !user.active || user.deletedAt) {
      // Same work as a real check so response time doesn't reveal which emails exist.
      await bcrypt.compare(String(password), DUMMY_HASH);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      await auditService.log({ userId: user.id, action: 'LOGIN_FAILED', entityType: 'user', entityId: user.id, ipAddress: ip, userAgent: ua, actorLabel: user.email });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check vendor/account suspension
    if (user.vendor && user.vendor.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, error: 'Account suspended. Contact your OEM administrator.', suspended: true });
    }

    // 2FA check
    if (user.totpEnabled) {
      if (!totpCode) {
        return res.status(200).json({ success: true, requires2FA: true });
      }
      const valid = totp.check(totpCode, user.totpSecret);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Invalid 2FA code' });
      }
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      vendorId: user.vendorId,
      oemId: user.oemId,
    };

    const accessToken = signAccess(tokenPayload);
    const refreshToken = signRefresh({ userId: user.id });

    await auditService.log({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ip,
      userAgent: ua,
      actorLabel: user.email,
    });

    return res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        vendorId: user.vendorId,
        oemId: user.oemId,
        totpEnabled: user.totpEnabled,
        mustChangePassword: user.mustChangePassword || false,
      },
    });
  } catch (err) {
    logger.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, error: 'Refresh token required' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: JWT_ALGS });
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, vendorId: true, oemId: true, active: true, deletedAt: true, lastPasswordChange: true },
    });
    if (!user || !user.active || user.deletedAt) {
      return res.status(401).json({ success: false, error: 'Account not found or deactivated' });
    }

    // If password changed after token was issued, invalidate token
    if (user.lastPasswordChange && decoded.iat) {
      const tokenIssuedAt = decoded.iat * 1000;
      if (user.lastPasswordChange.getTime() > tokenIssuedAt + 1000) {
        return res.status(401).json({ success: false, error: 'Session invalidated. Please log in again.', code: 'TOKEN_INVALIDATED' });
      }
    }

    const tokenPayload = { userId: user.id, email: user.email, role: user.role, vendorId: user.vendorId, oemId: user.oemId };
    const accessToken = signAccess(tokenPayload);
    const newRefresh = signRefresh({ userId: user.id });

    // `data` mirrors the tokens for the web app, which reads res.data.data.
    return res.json({ success: true, accessToken, refreshToken: newRefresh, data: { accessToken, refreshToken: newRefresh } });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true, fullName: true, email: true, role: true, vendorId: true, oemId: true, totpEnabled: true, lastLoginAt: true, mustChangePassword: true,
        vendor: { select: { companyName: true, status: true } }, oem: { select: { name: true } },
      },
    });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.logout = async (req, res) => {
  await auditService.log({ userId: req.user.userId, action: 'LOGOUT', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, actorLabel: req.user.email });
  return res.json({ success: true, message: 'Logged out successfully' });
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent user enumeration
    const successMsg = { success: true, message: 'If that email exists, a reset code has been sent.' };
    if (!user || !user.active || user.deletedAt) return res.json(successMsg);

    // Rate check: max 3 resets per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (user.lastResetAt && user.lastResetAt > oneHourAgo && user.resetAttempts >= 3) {
      return res.status(429).json({ success: false, error: 'Too many reset attempts. Try again later.' });
    }

    // Generate 6-digit OTP + secure token
    const otp = crypto.randomInt(100000, 1000000).toString();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken + otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Reset the request counter once the last request is over an hour old.
    const freshWindow = !user.lastResetAt || user.lastResetAt <= oneHourAgo;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: rawToken,
        resetTokenHash: tokenHash,
        resetExpires: expiresAt,
        resetAttempts: freshWindow ? 1 : { increment: 1 },
        lastResetAt: new Date(),
      },
    });

    await emailService.sendPasswordReset({ to: email, name: user.fullName, otp });
    await auditService.log({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: user.id, ipAddress: ip, actorLabel: email });

    return res.json(successMsg);
  } catch (err) {
    logger.error('Forgot password error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Wrong-code counts per user (in memory; a restart only resets the count).
const otpFailures = new Map();

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.resetToken || !user.resetExpires) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset request' });
    }

    if (new Date() > user.resetExpires) {
      return res.status(400).json({ success: false, error: 'Reset code has expired. Please request a new one.' });
    }

    const expectedHash = hashToken(user.resetToken + otp);
    if (!safeEqual(expectedHash, user.resetTokenHash)) {
      // A 6-digit code can be guessed with enough tries, so a few wrong guesses
      // cancel the reset and a new code must be requested.
      const failed = (otpFailures.get(user.id) || 0) + 1;
      otpFailures.set(user.id, failed);
      if (failed >= MAX_OTP_TRIES) {
        otpFailures.delete(user.id);
        await prisma.user.update({ where: { id: user.id }, data: { resetToken: null, resetTokenHash: null, resetExpires: null } });
        return res.status(400).json({ success: false, error: 'Too many wrong codes. Please request a new reset code.' });
      }
      return res.status(400).json({ success: false, error: 'Invalid OTP code' });
    }
    otpFailures.delete(user.id);

    // Short-lived token for the password reset step. It carries a fingerprint of
    // this reset so it works only once and only for this request.
    const verifiedToken = jwt.sign(
      { userId: user.id, purpose: 'password_reset', rh: user.resetTokenHash.slice(0, 16) },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '10m' }
    );

    return res.json({ success: true, verifiedToken, message: 'OTP verified. Proceed to set new password.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    // The web app sends `token`; older clients sent `verifiedToken`.
    const verifiedToken = req.body.verifiedToken || req.body.token;
    const { password } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(verifiedToken, process.env.JWT_SECRET, { algorithms: JWT_ALGS });
    } catch {
      return res.status(400).json({ success: false, error: 'Reset session expired. Start over.' });
    }

    if (decoded.purpose !== 'password_reset' || !decoded.rh) {
      return res.status(400).json({ success: false, error: 'Invalid reset token' });
    }

    // Single use: the reset must still be open and be the same one the code was checked against.
    const target = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { resetTokenHash: true, resetExpires: true } });
    if (!target?.resetTokenHash || !target.resetTokenHash.startsWith(decoded.rh) || !target.resetExpires || target.resetExpires < new Date()) {
      return res.status(400).json({ success: false, error: 'This reset link has already been used or has expired. Start over.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: decoded.userId },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenHash: null,
        resetExpires: null,
        resetAttempts: 0,
        lastResetAt: new Date(),
        lastPasswordChange: new Date(),  // invalidates all existing refresh tokens
      },
    });

    await auditService.log({ userId: decoded.userId, action: 'PASSWORD_RESET_COMPLETED', entityType: 'user', entityId: decoded.userId, ipAddress: req.ip, actorLabel: 'system' });

    return res.json({ success: true, message: 'Password updated. All sessions have been invalidated.' });
  } catch (err) {
    logger.error('Reset password error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.setup2FA = async (req, res) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { totpEnabled: true } });
    if (current?.totpEnabled) {
      return res.status(400).json({ success: false, error: '2FA is already on. Turn it off first to set up a new device.' });
    }
    const secret = totp.generateSecret();
    const otpAuthUrl = totp.keyuri(req.user.email, 'FleetAnchor Pro', secret);

    await prisma.user.update({ where: { id: req.user.userId }, data: { totpSecret: secret } });

    return res.json({ success: true, secret, otpAuthUrl });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.verify2FA = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user?.totpSecret || !code) return res.status(400).json({ success: false, error: 'Start 2FA setup first' });
    const valid = totp.check(String(code), user.totpSecret);
    if (!valid) return res.status(400).json({ success: false, error: 'Invalid code' });
    await prisma.user.update({ where: { id: req.user.userId }, data: { totpEnabled: true } });
    await auditService.log({ userId: req.user.userId, action: '2FA_ENABLED', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, actorLabel: req.user.email });
    return res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.disable2FA = async (req, res) => {
  try {
    // A stolen session alone must not be enough to switch 2FA off.
    const { code, password } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const codeOk = user?.totpEnabled && code && totp.check(String(code), user.totpSecret);
    const passwordOk = password && user && (await bcrypt.compare(String(password), user.passwordHash));
    if (!codeOk || !passwordOk) {
      return res.status(400).json({ success: false, error: 'Enter your password and a current 2FA code to turn 2FA off.' });
    }
    await prisma.user.update({ where: { id: req.user.userId }, data: { totpEnabled: false, totpSecret: null } });
    await auditService.log({ userId: req.user.userId, action: '2FA_DISABLED', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, actorLabel: req.user.email });
    return res.json({ success: true, message: '2FA disabled' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.register = async (req, res) => {
  try {
    const { fullName, email, password, role, vendorId } = req.body;
    const caller = req.user;

    // Only FLEET_MANAGER can create users under their vendor
    // SUPER_ADMIN and OEM_ADMIN can create any
    const allowedCreators = ['SUPER_ADMIN', 'OEM_ADMIN', 'FLEET_MANAGER'];
    if (!allowedCreators.includes(caller.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    // Check plan user limit for vendors on Growth plan
    if (caller.role === 'FLEET_MANAGER' && caller.vendorId) {
      const sub = await prisma.subscription.findFirst({
        where: { vendorId: caller.vendorId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub || sub.plan === 'GROWTH') {
        const existingCount = await prisma.user.count({ where: { vendorId: caller.vendorId, active: true } });
        if (existingCount >= 2) {
          return res.status(403).json({ success: false, error: 'Growth plan allows 2 users maximum. Upgrade to Enterprise.', upgradeRequired: true });
        }
      }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    const { resolveVendorId } = require('../utils/tenant');
    const targetVendorId = await resolveVendorId(caller, vendorId);
    if (!targetVendorId) return res.status(403).json({ success: false, error: 'You cannot add users to that fleet' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role,
        vendorId: targetVendorId,
        oemId: caller.oemId,
        mustChangePassword: true,
      },
    });

    await emailService.sendWelcome({ to: email, name: fullName, role, tempPassword: password });
    await auditService.log({ userId: caller.userId, action: 'USER_CREATED', entityType: 'user', entityId: user.id, ipAddress: req.ip, actorLabel: caller.email });

    return res.status(201).json({ success: true, userId: user.id, message: 'User created and welcome email sent.' });
  } catch (err) {
    logger.error('Register error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.checkVendorInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { inviteToken: token },
      include: { oem: { select: { name: true } } },
    });
    if (!vendor) return res.status(404).json({ success: false, error: 'Invite link not found or already used.' });
    if (vendor.inviteAccepted) return res.status(410).json({ success: false, error: 'This invite has already been accepted. Please log in.' });
    if (vendor.inviteExpiry && new Date() > vendor.inviteExpiry) {
      return res.status(410).json({ success: false, error: 'This invite link has expired. Ask your OEM to resend.' });
    }
    res.json({ success: true, data: {
      companyName: vendor.companyName,
      email: vendor.contactEmail,
      oemName: vendor.oem?.name,
      trialEndsAt: vendor.trialEndsAt,
      plan: vendor.trialPlan,
    }});
  } catch (err) {
    logger.error('checkVendorInvite error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.acceptVendorInvite = async (req, res) => {
  try {
    const { token, fullName, password } = req.body;
    const vendor = await prisma.vendor.findUnique({ where: { inviteToken: token } });
    if (!vendor) return res.status(404).json({ success: false, error: 'Invalid invite token.' });
    if (vendor.inviteAccepted) return res.status(410).json({ success: false, error: 'Invite already accepted.' });
    if (vendor.inviteExpiry && new Date() > vendor.inviteExpiry) {
      return res.status(410).json({ success: false, error: 'Invite link expired.' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email: vendor.contactEmail } });
    if (existingUser) return res.status(409).json({ success: false, error: 'An account with this email already exists. Please log in.' });

    const passwordHash = await bcrypt.hash(password, 12);

    // Create Fleet Manager user + mark invite accepted (transaction)
    await prisma.$transaction([
      prisma.user.create({
        data: {
          fullName,
          email: vendor.contactEmail,
          passwordHash,
          role: 'FLEET_MANAGER',
          vendorId: vendor.id,
          oemId: vendor.oemId,
          active: true,
        },
      }),
      prisma.vendor.update({
        where: { id: vendor.id },
        data: { inviteAccepted: true, inviteToken: null },
      }),
    ]);

    res.json({ success: true, message: 'Account created! You can now log in.' });
  } catch (err) {
    logger.error('acceptVendorInvite error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId || req.user.id } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    if (currentPassword === newPassword) return res.status(400).json({ success: false, error: 'Choose a password you have not used here before' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, lastPasswordChange: new Date(Date.now() - 2000) },
    });
    await auditService.log({ userId: user.id, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: user.id, ipAddress: req.ip, actorLabel: user.email });
    // Other sessions are signed out; this device gets fresh tokens so it stays signed in.
    const tokens = issueTokens(user);
    res.json({ success: true, message: 'Password changed successfully. All previous sessions have been invalidated.', ...tokens });
  } catch (err) {
    logger.error('changePassword error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// User fills in email + new password → goes to their manager for approval
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email, newPassword, fullName } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        vendor: {
          include: {
            users: {
              where: {
                role: { in: ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'SUPER_ADMIN', 'OEM_ADMIN'] },
                active: true,
                NOT: { email },
              },
              take: 2,
              select: { email: true, fullName: true, role: true },
            },
          },
        },
      },
    });

    // Always return success to prevent user enumeration
    const success = { success: true, message: 'Reset request submitted. Your manager will review and approve it.' };
    if (!user || !user.active || user.deletedAt) return res.json(success);

    // Find approver (next higher authority)
    const approvers = user.vendor?.users || [];
    const approverEmails = approvers.map(a => a.email);

    // For Super Admin / OEM — approve themselves via email link
    if (['SUPER_ADMIN', 'OEM_ADMIN'].includes(user.role) || approvers.length === 0) {
      // Fall back to standard OTP flow
      return res.json({ success: true, message: 'Use the standard email OTP reset instead.', useOtp: true });
    }

    // Hash the new password now — only applied after approval
    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Expire any existing pending requests for this user
    await prisma.passwordResetRequest.updateMany({
      where: { userId: user.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    const resetReq = await prisma.passwordResetRequest.create({
      data: {
        userId: user.id,
        vendorId: user.vendorId || null,
        fullName: user.fullName || email,
        email,
        newPasswordHash,
        token,
        expiresAt,
      },
    });

    // Send approval email to each approver
    const { sendEmail } = require('../services/emailService');
    const frontendUrl = process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app';

    for (const approver of approvers) {
      await sendEmail({
        to: approver.email,
        subject: `🔑 Password Reset Request — ${escHtml(user.fullName || email)} needs approval`,
        html: `
        <!DOCTYPE html><html><body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif">
        <div style="max-width:600px;margin:0 auto;padding:24px 16px">
          <div style="background:#0A1628;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
            <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:2.5px">PASSWORD RESET APPROVAL</div>
          </div>
          <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;box-shadow:0 4px 16px rgba(0,0,0,.10)">
            <p style="font-size:14px;color:#333;margin:0 0 6px">Dear ${escHtml(approver.fullName)},</p>
            <p style="font-size:13px;color:#666;margin:0 0 20px;line-height:1.6">
              <strong>${escHtml(user.fullName || email)}</strong> has requested a password reset and needs your approval.
              If you recognise this person and the request is legitimate, click the button below.
            </p>
            <div style="background:#F0F4F8;border-radius:10px;padding:16px;margin-bottom:20px">
              <p style="font-size:12px;color:#444;margin:0 0 4px"><strong>Requested by:</strong> ${escHtml(user.fullName || email)}</p>
              <p style="font-size:12px;color:#444;margin:0 0 4px"><strong>Email:</strong> ${escHtml(email)}</p>
              <p style="font-size:12px;color:#444;margin:0 0 4px"><strong>Role:</strong> ${user.role}</p>
              <p style="font-size:12px;color:#444;margin:0"><strong>Requested at:</strong> ${new Date().toLocaleString('en-NG')}</p>
            </div>
            <div style="text-align:center;margin-bottom:12px">
              <a href="${frontendUrl}/auth/approve-reset/${token}?action=approve"
                 style="background:#22C55E;color:#fff;font-weight:700;padding:13px 28px;border-radius:9px;text-decoration:none;font-size:14px;display:inline-block;margin-right:10px">
                ✅ Approve Reset
              </a>
              <a href="${frontendUrl}/auth/approve-reset/${token}?action=reject"
                 style="background:#E84B4B;color:#fff;font-weight:700;padding:13px 28px;border-radius:9px;text-decoration:none;font-size:14px;display:inline-block">
                ❌ Reject
              </a>
            </div>
            <p style="font-size:11px;color:#aaa;text-align:center;margin:0">
              This approval link expires in 24 hours. If you do not recognise this request, reject it immediately.
            </p>
          </div>
        </div></body></html>`,
      }).catch(() => {});
    }

    await auditService.log({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: user.id, ipAddress: req.ip, actorLabel: email });

    return res.json(success);
  } catch (err) {
    logger.error('requestPasswordReset error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.reviewPasswordReset = async (req, res) => {
  try {
    const { token } = req.params;
    const { action } = req.body; // 'approve' or 'reject'

    const resetReq = await prisma.passwordResetRequest.findUnique({ where: { token }, include: { user: true } });

    if (!resetReq) return res.status(404).json({ success: false, error: 'Reset request not found or already processed' });
    if (resetReq.status !== 'PENDING') return res.status(400).json({ success: false, error: `Request already ${resetReq.status.toLowerCase()}` });
    if (new Date() > resetReq.expiresAt) {
      await prisma.passwordResetRequest.update({ where: { token }, data: { status: 'EXPIRED' } });
      return res.status(410).json({ success: false, error: 'Reset request has expired' });
    }

    if (action === 'approve') {
      // Apply the pre-hashed password
      await prisma.user.update({
        where: { id: resetReq.userId },
        data: { passwordHash: resetReq.newPasswordHash, lastPasswordChange: new Date() },
      });
      await prisma.passwordResetRequest.update({
        where: { token },
        data: { status: 'APPROVED', reviewedAt: new Date() },
      });

      // Notify the user their reset was approved
      const { sendEmail } = require('../services/emailService');
      await sendEmail({
        to: resetReq.email,
        subject: '✅ Your password reset has been approved — FleetAnchor Pro',
        html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0A1628;border-radius:12px;color:#fff">
          <h2 style="color:#F5A623;text-align:center">⚓ FleetAnchor Pro</h2>
          <p style="color:#94a3b8;text-align:center">Your password reset has been <strong style="color:#22C55E">approved</strong>.</p>
          <p style="color:#94a3b8;text-align:center">You can now log in with your new password.</p>
          <div style="text-align:center;margin-top:24px">
            <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/login"
               style="background:#F5A623;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">
              Sign In Now
            </a>
          </div>
        </div>`,
      }).catch(() => {});

      await auditService.log({ userId: resetReq.userId, action: 'PASSWORD_RESET_APPROVED', entityType: 'user', entityId: resetReq.userId, ipAddress: req.ip, actorLabel: 'manager' });

      return res.json({ success: true, action: 'approved', message: 'Password reset approved. User can now login with their new password.' });
    } else {
      await prisma.passwordResetRequest.update({ where: { token }, data: { status: 'REJECTED', reviewedAt: new Date() } });
      await auditService.log({ userId: resetReq.userId, action: 'PASSWORD_RESET_REJECTED', entityType: 'user', entityId: resetReq.userId, ipAddress: req.ip, actorLabel: 'manager' });
      return res.json({ success: true, action: 'rejected', message: 'Reset request rejected.' });
    }
  } catch (err) {
    logger.error('reviewPasswordReset error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.issueCredentials = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    const caller = req.user;

    // Only users inside the caller's own fleet / OEM, and only of a lower rank.
    const target = await prisma.user.findFirst({ where: { id: String(userId), deletedAt: null, ...userWhere(caller) } });
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    if (!outranks(caller.role, target.role)) return res.status(403).json({ success: false, error: 'Insufficient authority to reset this user\'s password' });
    if (newPassword && String(newPassword).length < 12) return res.status(400).json({ success: false, error: 'Password must be at least 12 characters' });

    const pw = newPassword || generateTempPassword();
    const passwordHash = await bcrypt.hash(pw, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true, lastPasswordChange: new Date() },
    });

    // Email new credentials
    const { sendEmail } = emailService;
    await sendEmail({
      to: target.email,
      subject: '🔑 Your FleetAnchor Pro login credentials have been reset',
      html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0A1628;border-radius:12px;color:#fff">
        <h2 style="color:#F5A623;text-align:center">⚓ FleetAnchor Pro</h2>
        <p style="color:#94a3b8">Your login credentials have been reset by your manager.</p>
        <div style="background:#0F2040;border-radius:8px;padding:16px;margin:16px 0">
          <p style="color:#94a3b8;font-size:13px;margin:0 0 8px">Email: <strong style="color:#fff">${escHtml(target.email)}</strong></p>
          <p style="color:#94a3b8;font-size:13px;margin:0">Temp password: <strong style="color:#F5A623;font-family:monospace">${escHtml(pw)}</strong></p>
        </div>
        <p style="color:#94a3b8;font-size:12px">You will be required to change this password on first login.</p>
        <div style="text-align:center;margin-top:20px">
          <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/login"
             style="background:#F5A623;color:#000;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none">
            Sign In Now →
          </a>
        </div>
      </div>`,
    }).catch(() => {});

    await auditService.log({ userId: caller.userId, action: 'CREDENTIALS_ISSUED', entityType: 'user', entityId: userId, ipAddress: req.ip, actorLabel: caller.email });

    res.json({ success: true, message: `New credentials sent to ${target.email}`, tempPassword: pw });
  } catch (err) {
    logger.error('issueCredentials error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[crypto.randomInt(chars.length)];
  return pw + crypto.randomInt(1000, 10000);
}
