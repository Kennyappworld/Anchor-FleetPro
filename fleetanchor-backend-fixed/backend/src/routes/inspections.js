const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/inspectionController');

router.use(authenticate);

// Driver routes (all roles that operate vehicles)
const vehicleOperators = ['DRIVER', 'FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT', 'SUPER_ADMIN'];

router.post('/scan',        requireRole(...vehicleOperators), ctrl.scanVehicle);
router.post('/odometer',    requireRole(...vehicleOperators), ctrl.captureOdometer);
router.post('/submit',      requireRole(...vehicleOperators), ctrl.submitInspection);
router.get('/summary',      requireRole('FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'SUPER_ADMIN', 'OEM_ADMIN'), ctrl.dashboardSummary);
router.get('/vehicle/:vehicleId', requireRole('FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'SUPER_ADMIN', 'OEM_ADMIN'), ctrl.listForVehicle);
router.get('/vehicle/:vehicleId/tyres', requireRole(...vehicleOperators), ctrl.currentTyres);
router.post('/tyres/change', requireRole('FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'SUPER_ADMIN'), ctrl.registerTyreChange);

module.exports = router;
