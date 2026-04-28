const express = require("express");
const router = express.Router();
const controller = require("./invoice.controller");

// Finance Officer routes
router.get("/queue", controller.getInvoiceQueue);
router.get("/queue/:reportId", controller.getInvoiceQueueDetails);
router.post("/generate/:reportId", controller.generateInvoice);
router.get("/invoice/:id", controller.getInvoice);
router.put("/confirm/:id", controller.confirmInvoice);
router.get("/pending", controller.getPendingInvoices);
router.put("/send/:id", controller.sendInvoiceToCustomer);
router.get("/accepted", controller.getAcceptedInvoices);
router.get("/rejected", controller.getRejectedInvoices);
router.get("/paid", controller.getPaidInvoices);
router.get("/auto-cancelled", controller.getAutoCancelledInvoices);
router.get("/dashboard", controller.getDashboardStats);

// Debug route
router.get("/debug/queue", controller.debugInvoiceQueue);

// Customer routes
router.get("/customer/:invoiceId", controller.getInvoiceForCustomer);
router.put("/accept/:invoiceId", controller.acceptInvoice);
router.put("/reject/:invoiceId", controller.rejectInvoice);
router.put("/cancel-rejection/:invoiceId", controller.cancelRejection);
router.put("/mark-paid/:id", controller.markAsPaid);
router.get("/by-number/:invoiceNumber", async (req, res) => {
    try {
        const inv = await require("./Invoice.model").findOne({ invoiceNumber: req.params.invoiceNumber })
            || await require("./Invoice.model").findById(req.params.invoiceNumber).catch(() => null);
        if (!inv) return res.status(404).json({ message: "Invoice not found" });
        res.json(inv);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});
module.exports = router;
