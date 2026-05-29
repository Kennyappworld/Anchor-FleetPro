const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { totp } = require('otplib');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const emailService = require('../services/emailService');
const auditService = require('../services/auditService');
const logger = require('../config/logger');

const prisma = new PrismaClient();

// ─── Token helpers ────────────────────────────────────────────────────────────
const signAccess = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });

const signRefresh = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// ─── LOGIN ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;
    const ip = req.ip;
    const ua = req.headers['user-agent'];

    const user = await prisma.user.findUnique({
      where: { email },
      include: { vendor: true, oem: true },
    });

    if (!user || !user.active) {
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

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, error: 'Refresh token required' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, vendorId: true, oemId: true, active: true, lastPasswordChange: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ success: false, error: 'Account not found or deactivated' });
    }

    // If password changed after token was issued, invalidate token
    if (user.lastPasswordChange && decoded.iat) {
      const tokenIssuedAt = decoded.iat * 1000;
      if (user.lastPasswordChange.getTime() > tokenIssuedAt) {
        return res.status(401).json({ success: false, error: 'Session invalidated. Please log in again.', code: 'TOKEN_INVALIDATED' });
      }
    }

    const tokenPayload = { userId: user.id, email: user.email, role: user.role, vendorId: user.vendorId, oemId: user.oemId };
    const accessToken = signAccess(tokenPayload);
    const newRefresh = signRefresh({ userId: user.id });

    return res.json({ success: true, accessToken, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
  }
};

// ─── ME ───────────────────────────────────────────────────────────────────────
exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, fullName: true, email: true, role: true, vendorId: true, oemId: true, totpEnabled: true, lastLoginAt: true },
      include: { vendor: { select: { companyName: true, status: true } }, oem: { select: { name: true } } },
    });
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  await auditService.log({ userId: req.user.userId, action: 'LOGOUT', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, actorLabel: req.user.email });
  return res.json({ success: true, message: 'Logged out successfully' });
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent user enumeration
    const successMsg = { success: true, message: 'If that email exists, a reset code has been sent.' };
    if (!user || !user.active) return res.json(successMsg);

    // Rate check: max 3 resets per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (user.lastResetAt && user.lastResetAt > oneHourAgo && user.resetAttempts >= 3) {
      return res.status(429).json({ success: false, error: 'Too many reset attempts. Try again later.' });
    }

    // Generate 6-digit OTP + secure token
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken + otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: rawToken,
        resetTokenHash: tokenHash,
        resetExpires: expiresAt,
        resetAttempts: { increment: 1 },
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

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────
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
    if (expectedHash !== user.resetTokenHash) {
      return res.status(400).json({ success: false, error: 'Invalid OTP code' });
    }

    // Issue a short-lived verified token for the password reset step
    const verifiedToken = jwt.sign(
      { userId: user.id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    return res.json({ success: true, verifiedToken, message: 'OTP verified. Proceed to set new password.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { verifiedToken, password } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(verifiedToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, error: 'Reset session expired. Start over.' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ success: false, error: 'Invalid reset token' });
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

// ─── SETUP 2FA ────────────────────────────────────────────────────────────────
exports.setup2FA = async (req, res) => {
  try {
    const secret = totp.generateSecret();
    const otpAuthUrl = totp.keyuri(req.user.email, 'FleetAnchor Pro', secret);

    await prisma.user.update({ where: { id: req.user.userId }, data: { totpSecret: secret } });

    return res.json({ success: true, secret, otpAuthUrl });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── VERIFY 2FA ───────────────────────────────────────────────────────────────
exports.verify2FA = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const valid = totp.check(code, user.totpSecret);
    if (!valid) return res.status(400).json({ success: false, error: 'Invalid code' });
    await prisma.user.update({ where: { id: req.user.userId }, data: { totpEnabled: true } });
    await auditService.log({ userId: req.user.userId, action: '2FA_ENABLED', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, actorLabel: req.user.email });
    return res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DISABLE 2FA ──────────────────────────────────────────────────────────────
exports.disable2FA = async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.user.userId }, data: { totpEnabled: false, totpSecret: null } });
    await auditService.log({ userId: req.user.userId, action: '2FA_DISABLED', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, actorLabel: req.user.email });
    return res.json({ success: true, message: '2FA disabled' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── REGISTER (admin creates sub-user) ───────────────────────────────────────
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

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role,
        vendorId: caller.role === 'FLEET_MANAGER' ? caller.vendorId : vendorId,
        oemId: caller.oemId,
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

// ─── Vendor Invite Check ──────────────────────────────────────────────────────
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

// ─── Accept Vendor Invite (creates Fleet Manager account) ────────────────────
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

// ─── Change Password (first login or manual) ─────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.userId || req.user.id } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, lastPasswordChange: new Date() },
    });
    await auditService.log({ userId: user.id, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: user.id, ipAddress: req.ip, actorLabel: user.email });
    res.json({ success: true, message: 'Password changed successfully. All previous sessions have been invalidated.' });
  } catch (err) {
    logger.error('changePassword error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
