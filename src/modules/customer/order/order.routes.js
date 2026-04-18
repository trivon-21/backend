const router = require("express").Router();
const { protect } = require("../../../middleware/protect");
const { 
  getOrders, 
  getOrder, 
  trackOrder, 
  cancelOrder, 
  reuploadPayment 
} = require("./order.controller");

// GET track order (public)
router.get("/track", trackOrder);

// All other routes are protected
router.use(protect);

// GET all orders for user
router.get("/", getOrders);

// GET single order
router.get("/:id", getOrder);

// POST cancel order
router.post("/:id/cancel", cancelOrder);

// POST reupload payment
router.post("/:id/reupload-payment", reuploadPayment);

module.exports = router;
