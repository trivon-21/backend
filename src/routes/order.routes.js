const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/protect");
const ctrl = require("../controllers/order.controller");

// Public endpoint – track by reference number
router.get("/track", ctrl.trackOrder);

// Protected endpoints
router.use(protect);
router.get("/", ctrl.getOrders);
router.get("/:id", ctrl.getOrder);
router.post("/:id/cancel", ctrl.cancelOrder);
router.post("/:id/reupload-payment", ctrl.reuploadPayment);

module.exports = router;
