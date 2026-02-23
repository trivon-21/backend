const express = require("express");
const router = express.Router();
const controller = require("../controllers/payment.controller");

router.post("/", controller.createPayment);
router.get("/pending", controller.getPendingPayments);
router.put("/approve/:id", controller.approvePayment);
router.put("/reject/:id", controller.rejectPayment);
router.put("/reupload/:id", controller.reuploadSlip);
router.get("/approved", controller.getApprovedPayments);
router.get("/rejected", controller.getRejectedPayments);

module.exports = router;