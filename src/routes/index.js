const express = require('express');
const router = express.Router();

// HEAD Modules
const inspectionReportRoutes = require('../modules/shared/inspection/inspectionReport.routes');
const inspectionRoutes = require('../modules/shared/inspection/inspectionTicket.routes');
const installationRoutes = require('../modules/shared/installation/installation.routes');
const serviceRequestRoutes = require('../modules/shared/repair/repair.routes');
const materialRequestRoutes = require('../modules/shared/jobMaterialRequest/jobMaterialRequest.routes');
const techTeamRoutes = require('../modules/service-team/serviceTeam.routes');
const serviceTeamTaskController = require('../modules/service-team/task.controller');
const serviceTeamMemberController = require('../modules/service-team/team.controller');
const serviceHistoryController = require('../modules/shared/service-history/serviceHistory.controller');
const dashboardRoutes = require('../modules/technician/dashboard.routes');
const customerRoutes = require('../modules/user/user.routes');
const serviceReportRoutes = require('../modules/technician/technician.routes');
const maintenanceRoutes = require('../modules/shared/maintenance/maintenance.routes');

// origin/dev Modules
const authRoutes = require('../modules/auth/auth.routes');
const productRoutes = require('./product.routes');
const cartRoutes = require('./cart.routes');
const orderRoutes = require('./order.routes');
const bankDetailRoutes = require('./bankDetail.routes');
const cartScenarioRoutes = require('./cartScenario.routes');
const configRoutes = require('./config.routes');
const superAdminRoutes = require('../modules/super-admin/super-admin.routes');
const customerModuleRoutes = require('../modules/customer/customer.routes');
const salesRoutes = require('../modules/sales/sales.routes');
const csaRoutes = require('../modules/csa/csa.routes');
const financeRoutes = require('../modules/finance/finance.routes');
const inspectionTeamRoutes = require('../modules/inspection-team/inspection_team.routes');
const inventoryManagerRoutes = require('../modules/inventory-manager/inventory_manager.routes');
const managerRoutes = require('../modules/manager/manager.routes');

// Finance & Inspection legacy routes
const paymentRoutes = require('../modules/finance/payment.routes');
const inspectionTicketRoutes = require('../modules/finance/inspectionTicket.routes');
const inspectionOfficerRoutes = require('../modules/inspection-team/inspection.routes');
const invoiceRoutes = require('../modules/finance/invoice.routes');
const servicePaymentRoutes = require('../modules/finance/servicePayment.routes');
const auditLogRoutes = require('../modules/finance/auditLog.routes');
const financialReportRoutes = require('../modules/finance/financialReport.routes');
const purchaseRequestRoutes = require('../modules/finance/purchaseRequest.routes');
const maintenancePaymentRoutes = require('../modules/finance/maintenancePayment.routes');

const { API_SEGMENTS } = require('../constants/enums');

// Mount HEAD routes
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

router.get(API_SEGMENTS.TASKS, serviceTeamTaskController.getTasks);
router.get(API_SEGMENTS.TASKS_BY_ID, serviceTeamTaskController.getTaskById);
router.patch(API_SEGMENTS.TASKS_STATUS, serviceTeamTaskController.updateTaskStatus);
router.get(API_SEGMENTS.TEAM_DETAILS, serviceTeamMemberController.getTeamDetails);
router.get(API_SEGMENTS.SERVICE_HISTORY, serviceHistoryController.getCustomerHistory);

// Mount origin/dev routes
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/scenarios', cartScenarioRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/admin', bankDetailRoutes);
router.use('/checkout', bankDetailRoutes);
router.use('/config', configRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/customer', customerModuleRoutes);
router.use('/sales', salesRoutes);
router.use('/csa', csaRoutes);
router.use('/finance', financeRoutes);
router.use('/inspection', inspectionTeamRoutes);
router.use('/inventory', inventoryManagerRoutes);
router.use('/manager', managerRoutes);

// Mount Finance & Inspection routes
router.use('/payments', paymentRoutes);
router.use('/inspection-tickets', inspectionTicketRoutes);
router.use('/inspection-officer', inspectionOfficerRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/service-payments', servicePaymentRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/financial-report', financialReportRoutes);
router.use('/purchase-requests', purchaseRequestRoutes);
router.use('/maintenance-payments', maintenancePaymentRoutes);

module.exports = router;
