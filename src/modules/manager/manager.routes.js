const router = require("express").Router();
const controller = require("./manager.controller");
const analyticsController = require("./manager.analytics.controller");
const { protect } = require("../../middleware/protect");

// Manager dashboard data endpoint
router.get("/dashboard", protect, controller.getDashboard);

// Manager analytics & reports endpoint (?period=7d|30d|12m)
router.get("/analytics", protect, analyticsController.getAnalytics);

module.exports = router;
