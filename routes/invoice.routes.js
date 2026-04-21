const express    = require("express");
const router     = express.Router();
const controller = require("../controllers/invoice.controller");

// Finance Officer routes
router.get("/queue",                    controller.getInvoiceQueue);
router.get("/queue/:reportId",          controller.getInvoiceQueueDetails);
router.post("/generate/:reportId",      controller.generateInvoice);
router.get("/invoice/:id",              controller.getInvoice);
router.put("/confirm/:id",              controller.confirmInvoice);
router.get("/pending",                  controller.getPendingInvoices);
router.put("/send/:id",                 controller.sendInvoiceToCustomer);
router.get("/accepted",                 controller.getAcceptedInvoices);
router.get("/rejected",                 controller.getRejectedInvoices);
router.get("/paid",                     controller.getPaidInvoices);
router.get("/auto-cancelled",           controller.getAutoCancelledInvoices);
router.get("/dashboard",                controller.getDashboardStats);

// Customer routes
router.get("/customer/:invoiceId",      controller.getInvoiceForCustomer);
router.put("/accept/:invoiceId",        controller.acceptInvoice);
router.put("/reject/:invoiceId",        controller.rejectInvoice);
router.put("/cancel-rejection/:invoiceId", controller.cancelRejection);

module.exports = router;