const router = require("express").Router();
const controller = require("./manager.controller");
const analyticsController = require("./manager.analytics.controller");
const ticketsController = require("./manager.tickets.controller");
const ordersController = require("./manager.orders.controller");
const { protect } = require("../../middleware/protect");
const { authorize } = require("../../middleware/role.middleware");

// All manager routes require authentication and MANAGER role
router.use(protect);
router.use(authorize(["MANAGER", "SUPER_ADMIN"]));

// Status endpoint
router.get("/", controller.getStatus);

// Payment auto-cancel endpoint
router.post("/payments/auto-cancel", controller.triggerPaymentAutoCancel);

// Manager dashboard data endpoint
router.get("/dashboard", controller.getDashboard);

// Manager analytics & reports endpoint (?period=7d|30d|12m)
router.get("/analytics", analyticsController.getAnalytics);

// Tickets management (?status=&priority=)
router.get("/tickets", ticketsController.list);
router.get("/technicians", ticketsController.listTechnicians);
router.patch("/tickets/:id", ticketsController.update);
router.get("/work-items", ticketsController.listWorkItems);
router.patch("/work-items/:sourceType/:sourceId/control", ticketsController.updateWorkItemControl);
router.post("/work-items/:sourceType/:sourceId/:action", ticketsController.runWorkItemAction);

// Orders / purchase-request approvals (?status=)
router.get("/orders", ordersController.list);
router.patch("/orders/:id", ordersController.decide);
router.get("/receipt-authorizations", ordersController.listReceiptAuthorizations);
router.post("/receipt-authorizations/:id/decision", ordersController.decideReceiptAuthorization);

module.exports = router;
