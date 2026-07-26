const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/inspectionController');

router.use(authenticate);

const drivers = ['DRIVER','FLEET_MANAGER','MAINTENANCE_SUPERVISOR','FIELD_AGENT','SUPER_ADMIN'];
const managers = ['FLEET_MANAGER','MAINTENANCE_SUPERVISOR','SUPER_ADMIN','OEM_ADMIN'];

// Driver inspection flow
router.post('/scan',            requireRole(...drivers), ctrl.scanVehicle);
router.post('/odometer',        requireRole(...drivers), ctrl.captureOdometer);
router.post('/submit',          requireRole(...drivers), ctrl.submitInspection);

// Fleet manager controls
router.get('/summary',          requireRole(...managers), ctrl.dashboardSummary);
router.get('/vehicle/:vehicleId', requireRole(...managers), ctrl.listForVehicle);
router.get('/vehicle/:vehicleId/tyres', requireRole(...drivers), ctrl.currentTyres);
router.post('/tyres/change',    requireRole(...managers), ctrl.registerTyreChange);
router.post('/tyres/config',    requireRole(...managers), ctrl.setTyreConfig);
router.get('/checklist-templates', requireRole(...managers), ctrl.getTemplates);
router.post('/checklist-templates', requireRole(...managers), ctrl.saveTemplate);
router.get('/leaderboard',      requireRole(...managers), ctrl.driverLeaderboard);

// Super Admin — feature flags
router.get('/feature-flags',    requireRole('SUPER_ADMIN'), ctrl.listFeatureFlags);
router.post('/feature-flags',   requireRole('SUPER_ADMIN'), ctrl.toggleFeatureFlag);

module.exports = router;
