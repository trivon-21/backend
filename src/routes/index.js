const express = require('express');

const inspectionReportRoutes = require('../modules/shared/inspection/inspectionReport.routes');
const inspectionRoutes = require('../modules/shared/inspection/inspection.routes');
const installationRoutes = require('../modules/shared/installation/installation.routes');
const serviceRequestRoutes = require('../modules/shared/serviceRequest/serviceRequest.routes');
const materialRequestRoutes = require('../modules/shared/inventory/inventory.routes');
const techTeamRoutes = require('../modules/service-team/serviceTeam.routes');
const serviceTeamTaskController = require('../modules/service-team/task.controller');
const serviceTeamMemberController = require('../modules/service-team/team.controller');
const serviceHistoryController = require('../modules/shared/service-history/serviceHistory.controller');
const dashboardRoutes = require('../modules/technician/dashboard.routes');
const customerRoutes = require('../modules/customer/customer.routes');
const serviceReportRoutes = require('../modules/technician/technician.routes');
const authRoutes = require('../modules/auth/auth.routes');
const maintenanceRoutes = require('../modules/shared/maintenance/maintenance.routes');
const { API_SEGMENTS } = require('../constants/enums');

const router = express.Router();

router.use(API_SEGMENTS.INSPECTION_REPORTS, inspectionReportRoutes);
router.use(API_SEGMENTS.INSPECTIONS, inspectionRoutes);
router.use(API_SEGMENTS.INSTALLATIONS, installationRoutes);
router.use(API_SEGMENTS.SERVICE_REQUESTS, serviceRequestRoutes);
router.use(API_SEGMENTS.SERVICE_VIEWS, serviceRequestRoutes);
router.use(API_SEGMENTS.MATERIAL_REQUESTS, materialRequestRoutes);
router.use(API_SEGMENTS.TECH_TEAMS, techTeamRoutes);
router.use(API_SEGMENTS.DASHBOARD, dashboardRoutes);
router.use(API_SEGMENTS.CUSTOMERS, customerRoutes);
router.use(API_SEGMENTS.SERVICE_REPORTS, serviceReportRoutes);
router.use(API_SEGMENTS.MAINTENANCE, maintenanceRoutes);
router.use(API_SEGMENTS.AUTH, authRoutes);

router.get(API_SEGMENTS.TASKS, serviceTeamTaskController.getTasks);
router.get(API_SEGMENTS.TASKS_BY_ID, serviceTeamTaskController.getTaskById);
router.patch(API_SEGMENTS.TASKS_STATUS, serviceTeamTaskController.updateTaskStatus);
router.get(API_SEGMENTS.TEAM_DETAILS, serviceTeamMemberController.getTeamDetails);
router.get(API_SEGMENTS.SERVICE_HISTORY, serviceHistoryController.getCustomerHistory);

module.exports = router;
