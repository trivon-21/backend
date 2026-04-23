/**
 * Customer Module - Routes Aggregator
 * Combines profile, dashboard, order, service-request, and inquiry routes
 */

const router = require("express").Router();
const { protect } = require("../../middleware/protect");

// Import sub-routes
const profileRoutes = require("./profile/profile.routes");
const dashboardRoutes = require("./dashboard/dashboard.routes");
const orderRoutes = require("./order/order.routes");
const notificationRoutes = require("./notifications/notifications.routes");

// Import shared routes (these should be available at /api/customer/*)
const serviceRequestRoutes = require("../../routes/service-request.routes");
const inquiryRoutes = require("../../routes/inquiry.routes");

// All customer routes require authentication
router.use(protect);

// Mount routes
router.use("/profile", profileRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/orders", orderRoutes);
router.use("/service-requests", serviceRequestRoutes);
router.use("/inquiries", inquiryRoutes);
router.use("/notifications", notificationRoutes);

module.exports = router;