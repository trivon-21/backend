const router = require("express").Router();
const controller = require("./manager.controller");
const analyticsController = require("./manager.analytics.controller");
const ticketsController = require("./manager.tickets.controller");
const ordersController = require("./manager.orders.controller");
const { devAuthBypass } = require("../../middleware/devAuthBypass");

router.use(devAuthBypass({
  _id: "000000000000000000000002",
  fullName: "Dev Manager User",
  role: "MANAGER",
}));

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

module.exports = router;
