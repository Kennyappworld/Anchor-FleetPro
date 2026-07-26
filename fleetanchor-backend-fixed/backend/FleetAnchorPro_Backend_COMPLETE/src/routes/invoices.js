const router = require('express').Router();
const { authenticate, requireRole, scopeToTenant, requireExportPermission } = require('../middleware/auth');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validate');
const ic = require('../controllers/invoiceController');

router.use(authenticate, scopeToTenant);

router.get('/', ic.list);
router.get('/:id', param('id').isUUID(), validate, ic.getOne);
router.get('/:id/pdf', param('id').isUUID(), requireExportPermission, validate, ic.downloadPDF);

router.post('/',
  requireRole(['SUPER_ADMIN','OEM_ADMIN','WORKSHOP_STAFF']),
  body('jobId').isUUID(),
  validate,
  ic.create
);

router.post('/:id/confirm-payment',
  requireRole(['SUPER_ADMIN','OEM_ADMIN','WORKSHOP_STAFF']),
  param('id').isUUID(),
  body('paystackRef').optional().trim(),
  validate,
  ic.confirmPayment
);

module.exports = router;
