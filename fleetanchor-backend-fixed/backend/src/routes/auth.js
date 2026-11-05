const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const clientIp = require('../utils/clientIp');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message: { success: false, error: 'Too many auth attempts. Try again in 15 minutes.' },
  // Per address and account, so colleagues behind one office connection don't lock each other out.
  keyGenerator: (req) => `${clientIp(req)}|${String(req.body?.email || '').toLowerCase()}`,
});

// Per account, whatever address the attempts come from (stops spread-out password guessing).
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many attempts for this account. Try again in 15 minutes.' },
  keyGenerator: (req) => `acct|${String(req.body?.email || '').toLowerCase()}`,
  skip: (req) => !req.body?.email,
});

// The web app refreshes its session on every page load, so this one is roomier.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  keyGenerator: (req) => clientIp(req),
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RESET_RATE_LIMIT_MAX) || 3,
  message: { success: false, error: 'Too many reset requests. Try again in 1 hour.' },
  // Per IP *and* email, so one person can't lock someone else out by spamming their email.
  keyGenerator: (req) => `${clientIp(req)}|${String(req.body?.email || '').toLowerCase()}`,
});

const strongPassword = (field) => body(field)
  .isLength({ min: 12 }).withMessage('Min 12 characters')
  .matches(/[A-Z]/).withMessage('Must contain uppercase')
  .matches(/[0-9]/).withMessage('Must contain number');

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

const forgotRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('accountType').isIn(['vendor', 'oem', 'field_agent', 'supervisor', 'admin'])
    .withMessage('Invalid account type'),
];

const resetRules = [
  body().custom((_, { req }) => {
    if (!req.body.verifiedToken && !req.body.token) throw new Error('Token required');
    return true;
  }),
  body('password')
    .isLength({ min: 12 }).withMessage('Min 12 characters')
    .matches(/[A-Z]/).withMessage('Must contain uppercase')
    .matches(/[0-9]/).withMessage('Must contain number')
    .matches(/[^A-Za-z0-9]/).withMessage('Must contain special character'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
];

const verifyOtpRules = [
  body('email').isEmail().normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Valid 6-digit OTP required'),
];

const registerRules = [
  body('fullName').trim().isLength({ min: 2 }).withMessage('Full name required'),
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isLength({ min: 12 })
    .matches(/[A-Z]/)
    .matches(/[0-9]/)
    .matches(/[^A-Za-z0-9]/),
  body('role').isIn(['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT']),
];

router.post('/login', accountLimiter, authLimiter, loginRules, validate, authController.login);
router.post('/logout', refreshLimiter, authController.logout);
router.post('/refresh', refreshLimiter, authController.refreshToken);
router.post('/me', authenticate, authController.me);

router.post('/forgot-password', resetLimiter, forgotRules, validate, authController.forgotPassword);
router.post('/verify-otp', authLimiter, verifyOtpRules, validate, authController.verifyOtp);
router.post('/reset-password', authLimiter, resetRules, validate, authController.resetPassword);

router.post('/2fa/setup', authenticate, authController.setup2FA);
router.post('/2fa/verify', authLimiter, authenticate, authController.verify2FA);
router.post('/2fa/disable', authLimiter, authenticate, authController.disable2FA);

router.post('/register', authenticate, registerRules, validate, authController.register);

router.get('/vendor-invite/:token', authLimiter, authController.checkVendorInvite);
router.post('/vendor-setup',
  authLimiter,
  body('token').notEmpty(),
  body('fullName').trim().isLength({ min: 2 }),
  strongPassword('password'),
  validate,
  authController.acceptVendorInvite
);

// Change password (authenticated — used for mustChangePassword flow)
router.post('/change-password',
  authenticate,
  authLimiter,
  body('currentPassword').notEmpty(),
  strongPassword('newPassword'),
  validate,
  authController.changePassword
);

router.post('/request-reset',
  resetLimiter,
  body('email').isEmail().normalizeEmail(),
  strongPassword('newPassword'),
  validate,
  authController.requestPasswordReset
);
// POST, not GET: opening a link (or an email scanner fetching it) must not change anything.
router.post('/approve-reset/:token', authLimiter, body('action').isIn(['approve', 'reject']), validate, authController.reviewPasswordReset);

router.post('/issue-credentials',
  authenticate,
  body('userId').notEmpty(),
  body('newPassword').optional().isLength({ min: 12 }),
  validate,
  authController.issueCredentials
);

// GET /api/auth/pending-resets — Fleet managers see pending reset requests for their vendor
router.get('/pending-resets',
  authenticate,
  async (req, res) => {
    try {
      const prisma = require('../config/prisma');
      const { vendorOwnedWhere } = require('../utils/tenant');
      // Only managers and above can see pending resets
      const allowed = ['FLEET_MANAGER','MAINTENANCE_SUPERVISOR','OEM_ADMIN','SUPER_ADMIN'];
      if (!allowed.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      // Scoped to the caller's own fleet / OEM (OEM admins used to see every tenant's requests).
      const where = { status: 'PENDING', expiresAt: { gt: new Date() }, ...vendorOwnedWhere(req.user) };
      const requests = await prisma.passwordResetRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true, fullName: true, email: true,
          requestedAt: true, expiresAt: true, status: true,
          user: { select: { role: true } },
        },
      });
      res.json({ success: true, data: requests });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Server error' });
    }
  }
);

module.exports = router;
