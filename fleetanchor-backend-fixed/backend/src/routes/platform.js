const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');

const prisma = new PrismaClient();

async function getSettings() {
  let s = await prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
  if (!s) {
    s = await prisma.platformSettings.create({
      data: {
        id: 'singleton',
        starterMonthly: 45000, starterAnnual: 450000,
        growthMonthly: 95000, growthAnnual: 950000,
        enterpriseMonthly: 250000, enterpriseAnnual: 2500000,
        annualDiscountPct: 16.7,
        trialDays: 30,
      },
    });
  }
  return s;
}

// GET /api/platform/settings — public (used by pricing page)
router.get('/settings', async (req, res, next) => {
  try {
    const s = await getSettings();
    res.json({ success: true, data: s });
  } catch (err) { next(err); }
});

// PATCH /api/platform/settings — Super Admin only
router.patch('/settings',
  authenticate,
  requireRole(['SUPER_ADMIN']),
  [
    body('starterMonthly').optional().isInt({ min: 1000 }),
    body('starterAnnual').optional().isInt({ min: 5000 }),
    body('growthMonthly').optional().isInt({ min: 1000 }),
    body('growthAnnual').optional().isInt({ min: 5000 }),
    body('enterpriseMonthly').optional().isInt({ min: 1000 }),
    body('enterpriseAnnual').optional().isInt({ min: 5000 }),
    body('annualDiscountPct').optional().isFloat({ min: 0, max: 50 }),
    body('trialDays').optional().isInt({ min: 1, max: 365 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const allowed = ['starterMonthly','starterAnnual','growthMonthly','growthAnnual','enterpriseMonthly','enterpriseAnnual','annualDiscountPct','trialDays'];
      const data = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      data.updatedBy = req.user.id;

      const s = await prisma.platformSettings.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', ...data },
        update: data,
      });

      await logAction(req, 'PLATFORM_SETTINGS_UPDATED', 'PlatformSettings', 'singleton', { changes: data });
      res.json({ success: true, data: s, message: 'Pricing rates updated successfully' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
