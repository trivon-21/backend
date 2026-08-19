const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/protect");
const orderController = require("../controllers/order.controller");
const { validatePaymentSubmission } = require('../middleware/order.validation');

// Public tracking endpoint (from ours)
router.get("/track", orderController.trackOrder);

// Order Placement and Payment routes (from origin/dev)
router.post('/buy-only', orderController.createBuyOnlyOrder);
router.post('/buy-and-install', orderController.createBuyAndInstallOrder);
router.post('/initialize', orderController.createBuyOnlyOrder); // Keep for safety
router.post('/submit-payment',
  orderController.upload.single('slip'),
  validatePaymentSubmission,
  orderController.submitPayment
);

// General order detail endpoints (from origin/dev)
router.get('/user/:userId', orderController.getOrdersByUser);
router.get('/id/:id', orderController.getOrderById);

// Protected order status management endpoints (from ours)
router.use(protect);
router.get("/", orderController.getOrders);
router.get("/:id", orderController.getOrder);
router.post("/:id/cancel", orderController.cancelOrder);
router.post("/:id/reupload-payment", orderController.reuploadPayment);

module.exports = router;
