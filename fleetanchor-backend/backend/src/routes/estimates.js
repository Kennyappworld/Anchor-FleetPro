const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const ec = require('../controllers/estimateController');

router.use(authenticate, scopeToTenant);

router.get('/:jobId', param('jobId').isUUID(), validate, ec.getForJob);

router.post('/',
  requireRole(['SUPER_ADMIN','OEM_ADMIN','WORKSHOP_STAFF']),
  body('jobId').isUUID(),
  body('partsTotal').isFloat({ min: 0 }),
  body('labourTotal').isFloat({ min: 0 }),
  body('notes').optional().trim(),
  validate,
  ec.create
);

router.patch('/:id',
  requireRole(['SUPER_ADMIN','OEM_ADMIN','WORKSHOP_STAFF']),
  param('id').isUUID(),
  validate,
  ec.update
);

module.exports = router;
