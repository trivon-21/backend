const express = require('express');

const inspectionReportRoutes = require('../modules/inspection-team/inspection.routes');
const inspectionRoutes = require('../modules/shared/inspection/inspection.route');
const installationRoutes = require('../modules/shared/installation/installation.route');
const serviceRequestRoutes = require('../modules/shared/serviceRequest/serviceRequest.route');
const materialRequestRoutes = require('../modules/inventory-manager/inventory.routes');
const techTeamRoutes = require('../modules/service-team/serviceTeam.routes');
const serviceTeamTaskController = require('../modules/service-team/task.controller');
const serviceTeamMemberController = require('../modules/service-team/team.controller');
const serviceHistoryController = require('../modules/service-team/serviceHistory.controller');
const dashboardRoutes = require('../modules/super-admin/superAdmin.routes');
const customerRoutes = require('../modules/customer/customer.routes');
const serviceReportRoutes = require('../modules/technician/technician.routes');

const router = express.Router();

router.use('/inspections-reports', inspectionReportRoutes);
router.use('/inspections', inspectionRoutes);
router.use('/installations', installationRoutes);
router.use('/service-requests', serviceRequestRoutes);
router.use('/service-views', serviceRequestRoutes);
router.use('/material-requests', materialRequestRoutes);
router.use('/tech-teams', techTeamRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/customers', customerRoutes);
router.use('/service-reports', serviceReportRoutes);

router.get('/tasks', serviceTeamTaskController.getTasks);
router.get('/tasks/:id', serviceTeamTaskController.getTaskById);
router.patch('/tasks/:id/status', serviceTeamTaskController.updateTaskStatus);
router.get('/team-details', serviceTeamMemberController.getTeamDetails);
router.get('/service-history/:id', serviceHistoryController.getCustomerHistory);

module.exports = router;
