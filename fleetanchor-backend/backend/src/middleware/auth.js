const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── AUTHENTICATE ─────────────────────────────────────────────────────────────
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    // Verify user still active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, vendorId: true, oemId: true, active: true },
    });

    if (!user || !user.active) {
      return res.status(401).json({ success: false, error: 'Account not found or deactivated' });
    }

    req.user = { userId: user.id, email: user.email, role: user.role, vendorId: user.vendorId, oemId: user.oemId };
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

// ─── REQUIRE ROLES ────────────────────────────────────────────────────────────
exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: `Access denied. Required role: ${roles.join(' or ')}` });
  }
  next();
};

// ─── REQUIRE ACTIVE SUBSCRIPTION ─────────────────────────────────────────────
exports.requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user.vendorId) return next(); // OEM/admin roles pass through
    const sub = await prisma.subscription.findFirst({
      where: { vendorId: req.user.vendorId, status: { in: ['ACTIVE', 'EXPIRING'] } },
    });
    if (!sub) {
      return res.status(402).json({ success: false, error: 'No active subscription. Please subscribe to continue.', code: 'SUBSCRIPTION_REQUIRED' });
    }
    req.subscription = sub;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Subscription check failed' });
  }
};

// ─── REQUIRE EXPORT PERMISSION (Growth+ or higher) ───────────────────────────
exports.requireExportPermission = async (req, res, next) => {
  try {
    if (['SUPER_ADMIN', 'OEM_ADMIN', 'WORKSHOP_STAFF'].includes(req.user.role)) return next();
    if (!req.user.vendorId) return next();
    const sub = await prisma.subscription.findFirst({
      where: { vendorId: req.user.vendorId, status: { in: ['ACTIVE', 'EXPIRING'] } },
    });
    if (!sub) {
      return res.status(402).json({ success: false, error: 'Export requires an active subscription.', code: 'EXPORT_REQUIRES_SUBSCRIPTION' });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Permission check failed' });
  }
};

// ─── TENANT ISOLATION ─────────────────────────────────────────────────────────
// Ensures vendors can only see their own data, OEM sees their vendors' data
exports.scopeToTenant = (req, res, next) => {
  if (req.user.role === 'SUPER_ADMIN') {
    req.tenantScope = {}; // Super admin sees everything
  } else if (['OEM_ADMIN', 'WORKSHOP_STAFF'].includes(req.user.role)) {
    req.tenantScope = { oemId: req.user.oemId };
  } else {
    req.tenantScope = { vendorId: req.user.vendorId };
  }
  next();
};
