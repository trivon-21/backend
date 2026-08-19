const express = require('express');

const router = express.Router();
const dashboardController = require('./dashboard.controller');

const DASHBOARD_ROUTES = {
	SUMMARY: '/summary',
	ACTIVITY: '/activity',
	ALERTS: '/alerts',
};

router.get(DASHBOARD_ROUTES.SUMMARY, dashboardController.getDashboardSummary);
router.get(DASHBOARD_ROUTES.ACTIVITY, dashboardController.getRecentActivity);
router.get(DASHBOARD_ROUTES.ALERTS, dashboardController.getUrgentAlerts);

module.exports = router;
