const router = require("express").Router();
const controller = require("./manager.controller");
const analyticsController = require("./manager.analytics.controller");
const ticketsController = require("./manager.tickets.controller");
const ordersController = require("./manager.orders.controller");
const customersController = require("./manager.customers.controller");
const { protect } = require("../../middleware/protect");

// Manager dashboard data endpoint
router.get("/dashboard", protect, controller.getDashboard);

// Manager analytics & reports endpoint (?period=7d|30d|12m)
router.get("/analytics", protect, analyticsController.getAnalytics);

// Tickets management (?status=&priority=)
router.get("/tickets", protect, ticketsController.list);
router.patch("/tickets/:id", protect, ticketsController.update);

// Orders / purchase-request approvals (?status=)
router.get("/orders", protect, ordersController.list);
router.patch("/orders/:id", protect, ordersController.decide);

// Customer directory (?search=)
router.get("/customers", protect, customersController.list);

module.exports = router;
