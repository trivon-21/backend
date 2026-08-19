const express = require('express');
const router = express.Router();
const installationController = require('./installation.controller');

// Static paths MUST come before /:id to avoid "maintenance" being captured as an ID param
router.get('/maintenance/completed', installationController.getCompletedInstallationsForMaintenance);
router.post('/maintenance/repair-missing', installationController.repairMissingSchedules); // Safe repair: creates missing MaintenanceSchedule records, deletes nothing
router.post('/maintenance/upgrade-schedules', installationController.upgradeSchedules); // Upgrades 4-service records to 6 services

router.get('/', installationController.getAllInstallations);
router.get('/:id', installationController.getInstallationById);
router.patch('/:id/status', installationController.updateInstallationStatus);
router.post('/:id/complete', installationController.completeInstallation);

module.exports = router;
