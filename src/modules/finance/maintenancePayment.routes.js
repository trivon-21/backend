const express = require("express");
const router = express.Router();
const controller = require("./maintenancePayment.controller");

router.get("/pending", controller.getPendingVerification);
router.put("/approve/:id", controller.approvePayment);
router.put("/reject/:id", controller.rejectPayment);
router.get("/verified", controller.getVerifiedPayments);
router.get("/rejected", controller.getRejectedPayments);

module.exports = router;