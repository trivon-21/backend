const express = require('express');
const router = express.Router();
const controller = require('./maintenance.controller');

// ================== MAINTENANCE SCHEDULE WORKFLOWS ==================
router.get('/schedules', controller.getAllSchedules);
router.get('/schedules/:scheduleId', controller.getScheduleById);            // fetch a single schedule
router.post('/schedules/:scheduleId/draft', controller.saveDraft);           // allowed: 'New' | 'Draft Saved' → 'Draft Saved'
router.post('/schedules/:scheduleId/send-to-csa', controller.sendScheduleToCsa);  // allowed: 'Draft Saved' → 'Sent to CSA'
router.post('/schedules/:scheduleId/send-to-customer', controller.sendScheduleToCustomer);

// ================== EXECUTION & TAB CONVERSION PATHS ==================
router.post('/create-active', controller.createActiveMaintenance); // Replaces automated reminder creation
router.get('/', controller.getAllMaintenance);
router.get('/:maintenanceId', controller.getMaintenanceById);
router.post('/:maintenanceId/send-material-to-im', controller.sendMaterialListToInventoryManager);
router.post('/:maintenanceId/assign-team', controller.assignTeamToMaintenance);

module.exports = router;
