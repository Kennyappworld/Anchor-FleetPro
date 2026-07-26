const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/complianceController');

// All routes require authentication
router.use(authenticate);

// Vendor-level routes
router.get('/', requireRole('FLEET_MANAGER', 'SUPER_ADMIN', 'OEM_ADMIN'), ctrl.list);
router.get('/summary', requireRole('FLEET_MANAGER', 'SUPER_ADMIN', 'OEM_ADMIN'), ctrl.summary);
router.post('/', requireRole('FLEET_MANAGER', 'SUPER_ADMIN'), ctrl.add);
router.post('/bulk-import', requireRole('FLEET_MANAGER', 'SUPER_ADMIN'), ctrl.bulkImport);
router.patch('/:id', requireRole('FLEET_MANAGER', 'SUPER_ADMIN'), ctrl.update);
router.delete('/:id', requireRole('FLEET_MANAGER', 'SUPER_ADMIN'), ctrl.remove);

module.exports = router;
