const express = require('express');
const router = express.Router();
const dashboardController = require('./superAdmin.controller');

router.get('/summary', dashboardController.getDashboardSummary);
router.get('/activity', dashboardController.getRecentActivity);
router.get('/alerts', dashboardController.getUrgentAlerts);

module.exports = router;