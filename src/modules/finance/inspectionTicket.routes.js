const express    = require("express");
const router     = express.Router();
const controller = require("./inspectionTicket.controller");

// Customer routes
router.get("/order/:orderId",              controller.getOrCreateTicket);
router.put("/upload-slip/:ticketId",       controller.uploadSlip);
router.get("/available-dates/:ticketId",   controller.getAvailableDates);
router.put("/confirm-scheduling/:ticketId",controller.confirmScheduling);

// Finance Officer routes
router.get("/pending",                     controller.getPendingVerification);
router.put("/approve/:id",                 controller.approvePayment);
router.put("/reject/:id",                  controller.rejectPayment);
router.get("/verified",                    controller.getVerifiedPayments);
router.get("/rejected",                    controller.getRejectedPayments);

module.exports = router;