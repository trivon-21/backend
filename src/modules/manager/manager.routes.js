const router = require("express").Router();
const controller = require("./manager.controller");
const analyticsController = require("./manager.analytics.controller");
const ticketsController = require("./manager.tickets.controller");
const ordersController = require("./manager.orders.controller");
const { protect } = require("../../middleware/protect");
const { authorize } = require("../../middleware/role.middleware");

router.use(protect);
router.use(authorize(["MANAGER", "SUPER_ADMIN"]));

// Manager dashboard data endpoint
router.get("/dashboard", controller.getDashboard);

// Manager analytics & reports endpoint (?period=7d|30d|12m)
router.get("/analytics", analyticsController.getAnalytics);

// Tickets management (?status=&priority=)
router.get("/tickets", ticketsController.list);
router.get("/technicians", ticketsController.listTechnicians);
router.patch("/tickets/:id", ticketsController.update);

// Orders / purchase-request approvals (?status=)
router.get("/orders", ordersController.list);
router.patch("/orders/:id", ordersController.decide);
router.get("/receipt-authorizations", ordersController.listReceiptAuthorizations);
router.post("/receipt-authorizations/:id/decision", ordersController.decideReceiptAuthorization);

// Payment auto-cancel endpoint
router.post("/payments/auto-cancel", controller.triggerPaymentAutoCancel);

// Quotation approval/rejection endpoints
router.post("/orders/:orderId/approve", controller.approveQuotation);
router.post("/orders/:orderId/reject", controller.rejectQuotation);

module.exports = router;
