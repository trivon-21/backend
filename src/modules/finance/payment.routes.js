const express    = require("express");
const router     = express.Router();
const controller = require("./payment.controller");

router.get("/pending",        controller.getPendingPayments);
router.put("/approve/:id",    controller.approvePayment);
router.put("/reject/:id",     controller.rejectPayment);
router.get("/approved",       controller.getApprovedPayments);
router.get("/rejected",       controller.getRejectedPayments);

module.exports = router;