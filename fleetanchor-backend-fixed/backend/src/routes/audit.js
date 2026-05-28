const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant, requireExportPermission } = require('../middleware/auth');
const { query } = require('express-validator');
const { validate } = require('../middleware/validate');
const { getAuditLogs, verifyChain } = require('../services/auditService');

router.use(authenticate, scopeToTenant);

router.get('/',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('userId').optional().isUUID(),
  query('action').optional().trim(),
  validate,
  async (req, res, next) => {
    try {
      const result = await getAuditLogs(req.query, req.user);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }
);

router.get('/verify-chain',
  requireRole(['SUPER_ADMIN']),
  async (req, res, next) => {
    try {
      const { valid, firstBrokenAt } = await verifyChain(req.user.tenantId);
      res.json({ success: true, data: { valid, firstBrokenAt } });
    } catch (err) { next(err); }
  }
);

router.get('/export',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  requireExportPermission,
  async (req, res, next) => {
    try {
      const { hideCost = false, format = 'csv' } = req.query;
      const { data } = await getAuditLogs({ limit: 10000 }, req.user);

      if (format === 'csv') {
        const fields = ['createdAt','userId','action','entityType','entityId','ipAddress','deviceFingerprint'];
        const csv = [fields.join(','), ...data.map(r => fields.map(f => JSON.stringify(r[f] ?? '')).join(','))].join('\n');
        res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit-log.csv"' });
        return res.send(csv);
      }
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

module.exports = router;
