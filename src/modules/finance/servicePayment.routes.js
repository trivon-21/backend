const express = require("express");
const router = express.Router();
const controller = require("./servicePayment.controller");

router.get("/pending/:serviceType", controller.getPendingVerification);
router.put("/approve/:id", controller.approvePayment);
router.put("/reject/:id", controller.rejectPayment);
router.get("/verified/:serviceType", controller.getVerifiedPayments);
router.get("/rejected/:serviceType", controller.getRejectedPayments);

module.exports = router;