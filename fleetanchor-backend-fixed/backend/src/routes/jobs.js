const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const jc = require('../controllers/jobController');

router.use(authenticate, scopeToTenant);

router.get('/', jc.list);
router.get('/:id', param('id').isUUID(), validate, jc.getOne);

router.post('/',
  body('vehicleId').isUUID(),
  body('category').trim().notEmpty(),
  body('description').trim().isLength({ min: 10 }),
  validate,
  jc.create
);

router.patch('/:id/status',
  param('id').isUUID(),
  body('status').isIn(['DIAGNOSED','ESTIMATE_SENT','APPROVED','REPAIR_STARTED','COMPLETED','PAYMENT_CONFIRMED','CLOSED','QUERIED']),
  body('note').optional().trim(),
  validate,
  jc.updateStatus
);

router.post('/:id/estimate-response',
  requireRole(['FLEET_MANAGER','MAINTENANCE_SUPERVISOR']),
  param('id').isUUID(),
  body('action').isIn(['approve','query']),
  body('queryNote').optional().trim(),
  validate,
  jc.respondToEstimate
);

router.get('/:id/history',
  param('id').isUUID(),
  validate,
  jc.vehicleHistory
);

module.exports = router;
