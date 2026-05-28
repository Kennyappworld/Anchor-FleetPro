const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant } = require('../middleware/auth');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validate');
const vc = require('../controllers/vehicleController');

router.use(authenticate, scopeToTenant);

router.get('/', vc.list);
router.get('/search', vc.search);
router.get('/:id', param('id').isUUID(), validate, vc.getOne);
router.get('/:id/history', param('id').isUUID(), validate, vc.history);

router.post('/',
  requireRole(['SUPER_ADMIN','OEM_ADMIN','FLEET_MANAGER']),
  body('vin').trim().isLength({ min: 11, max: 17 }),
  body('plateNumber').trim().notEmpty(),
  body('make').trim().notEmpty(),
  body('model').trim().notEmpty(),
  body('year').isInt({ min: 1990, max: 2030 }),
  body('engineNumber').trim().notEmpty(),
  validate,
  vc.create
);

router.patch('/:id',
  requireRole(['SUPER_ADMIN','OEM_ADMIN','FLEET_MANAGER']),
  param('id').isUUID(),
  validate,
  vc.update
);

router.delete('/:id',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  param('id').isUUID(),
  validate,
  vc.remove
);

module.exports = router;
