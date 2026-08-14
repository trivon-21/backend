const express    = require("express");
const router     = express.Router();
const controller = require("./invoice.controller");

// ── DEBUG ──────────────────────────────────────────────────────────────────────
router.get("/debug/queue", controller.debugInvoiceQueue);

// ── REPAIR invoice routes ──────────────────────────────────────────────────────
router.get("/repair/queue",          controller.getRepairInvoiceQueue);
router.post("/repair/generate/:repairId", controller.generateRepairInvoice);
router.get("/repair/pending",        controller.getRepairPendingInvoices);
router.get("/repair/accepted",       controller.getRepairAcceptedInvoices);
router.get("/repair/rejected",       controller.getRepairRejectedInvoices);
router.get("/repair/paid",           controller.getRepairPaidInvoices);
router.get("/repair/auto-cancelled", controller.getRepairAutoCancelledInvoices);
router.get("/repair/dashboard",      controller.getRepairDashboardStats);

// ── INSTALLATION invoice routes (existing — unchanged) ─────────────────────────
router.get("/queue",                 controller.getInvoiceQueue);
router.get("/queue/:reportId",       controller.getInvoiceQueueDetails);
router.post("/generate/:reportId",   controller.generateInvoice);
router.get("/invoice/:id",           controller.getInvoice);
router.get("/by-number/:invoiceNumber", async (req, res) => {
  try {
    const Invoice = require("./Invoice.model");
    const inv = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber })
      || await Invoice.findById(req.params.invoiceNumber).catch(() => null);
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    res.json(inv);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.put("/confirm/:id",           controller.confirmInvoice);
router.get("/pending",               controller.getPendingInvoices);
router.put("/send/:id",              controller.sendInvoiceToCustomer);
router.get("/accepted",              controller.getAcceptedInvoices);
router.get("/rejected",              controller.getRejectedInvoices);
router.get("/paid",                  controller.getPaidInvoices);
router.get("/auto-cancelled",        controller.getAutoCancelledInvoices);
router.get("/dashboard",             controller.getDashboardStats);
router.put("/mark-paid/:id",         controller.markAsPaid);

// ── Customer routes (shared for both types) ────────────────────────────────────
router.get("/customer/:invoiceId",         controller.getInvoiceForCustomer);
router.put("/accept/:invoiceId",           controller.acceptInvoice);
router.put("/reject/:invoiceId",           controller.rejectInvoice);
router.put("/cancel-rejection/:invoiceId", controller.cancelRejection);

module.exports = router;