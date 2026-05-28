const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ─── Auth-specific rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message: { success: false, error: 'Too many auth attempts. Try again in 15 minutes.' },
  keyGenerator: (req) => req.ip,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: parseInt(process.env.RESET_RATE_LIMIT_MAX) || 3,
  message: { success: false, error: 'Too many reset requests. Try again in 1 hour.' },
  keyGenerator: (req) => req.body.email || req.ip,
});

// ─── Validation rules ─────────────────────────────────────────────────────────
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
  body('token').notEmpty().withMessage('Token required'),
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

// ─── Routes ──────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, loginRules, validate, authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/refresh', authController.refreshToken);
router.post('/me', authenticate, authController.me);

// ─── Password Reset Flow ──────────────────────────────────────────────────────
router.post('/forgot-password', resetLimiter, forgotRules, validate, authController.forgotPassword);
router.post('/verify-otp', authLimiter, verifyOtpRules, validate, authController.verifyOtp);
router.post('/reset-password', authLimiter, resetRules, validate, authController.resetPassword);

// ─── 2FA ─────────────────────────────────────────────────────────────────────
router.post('/2fa/setup', authenticate, authController.setup2FA);
router.post('/2fa/verify', authenticate, authController.verify2FA);
router.post('/2fa/disable', authenticate, authController.disable2FA);

// ─── Register (admin creates user / vendor registers field agent) ─────────────
router.post('/register', authenticate, registerRules, validate, authController.register);

// ─── Vendor Invite / Setup ────────────────────────────────────────────────────
router.get('/vendor-invite/:token', authController.checkVendorInvite);
router.post('/vendor-setup',
  body('token').notEmpty(),
  body('fullName').trim().isLength({ min: 2 }),
  body('password').isLength({ min: 12 }).matches(/[A-Z]/).matches(/[0-9]/).matches(/[^A-Za-z0-9]/),
  validate,
  authController.acceptVendorInvite
);

module.exports = router;
