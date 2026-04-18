/**
 * Customer Module - Routes Aggregator
 * Combines profile, dashboard, and order routes
 */

const router = require("express").Router();
const { protect } = require("../../middleware/protect");

// Import sub-routes
const profileRoutes = require("./profile/profile.routes");
const dashboardRoutes = require("./dashboard/dashboard.routes");
const orderRoutes = require("./order/order.routes");

// All customer routes require authentication
router.use(protect);

// Mount routes
router.use("/profile", profileRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/orders", orderRoutes);

module.exports = router;