const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant } = require('../middleware/auth');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const vc = require('../controllers/vendorController');

router.use(authenticate, scopeToTenant);

router.get('/', vc.list);
router.get('/deleted/list', requireRole(['SUPER_ADMIN']), vc.listDeleted);
router.get('/:id', param('id').isUUID(), validate, vc.getOne);
router.get('/:id/stats', param('id').isUUID(), validate, vc.stats);

router.post('/',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  vc.create
);

router.patch('/:id',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  param('id').isUUID(),
  validate,
  vc.update
);

router.post('/:id/suspend',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  param('id').isUUID(),
  body('reason').trim().notEmpty(),
  validate,
  vc.suspend
);

router.post('/:id/reinstate',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  param('id').isUUID(),
  validate,
  vc.reinstate
);

router.delete('/:id',
  requireRole(['SUPER_ADMIN','OEM_ADMIN']),
  param('id').isUUID(),
  validate,
  vc.remove
);

router.post('/:id/restore',
  requireRole(['SUPER_ADMIN']),
  param('id').isUUID(),
  validate,
  vc.restore
);

module.exports = router;
