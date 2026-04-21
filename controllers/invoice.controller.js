const mongoose = require("mongoose");
const Invoice  = require("../models/Invoice.model");
const cron     = require("node-cron");
const PDFDocument = require("pdfkit");

const getOrderModel = () => {
  try { return mongoose.model("Order"); }
  catch {
    const s = new mongoose.Schema({ orderRef: String, customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, itemName: String, quantity: Number, amount: Number, orderType: String }, { strict: false, timestamps: true });
    return mongoose.model("Order", s);
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({ fullName: String, lastName: String, email: String, phoneNumber: String, role: String, address: String }, { strict: false, timestamps: true });
    return mongoose.model("User", s);
  }
};

const getReportModel = () => {
  try { return mongoose.model("InspectionReport"); }
  catch { return null; }
};

const { sendInvoiceEmail, sendInvoiceAcceptedEmail, sendInvoiceRejectedEmail,
        sendPaymentReminderEmail, sendAutoCancelledEmail,
        sendRejectionWarningEmail, sendRejectionExpiredEmail } = require("../services/invoiceEmail.service");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

// ── GET orders ready for invoice generation ───────────────────────────────────
// These are orders where inspection report has been submitted to main technician
// Main technician adds material list to the report — we read from InspectionReport
exports.getInvoiceQueue = async (req, res) => {
  try {
    const InspectionReport = getReportModel();
    if (!InspectionReport) return res.json([]);

    // Get reports that are SUBMITTED and don't have an invoice yet
    const reports = await InspectionReport.find({ status: "SUBMITTED" });
    const Order   = getOrderModel();
    const User    = getUserModel();

    const result = [];
    for (const report of reports) {
      // Check if invoice already exists for this report
      const existing = await Invoice.findOne({ reportId: report._id });
      if (existing) continue; // already has invoice

      const order  = await Order.findById(report.orderId);
      const InspectionTicket = require("../models/InspectionTicket.model");
      const ticket = await InspectionTicket.findById(report.ticketId);
      const user   = await User.findById(ticket?.customerId);

      result.push({
        reportId:      report._id,
        ticketId:      report.ticketId,
        orderId:       order?._id,
        orderRef:      order?.orderRef || report.orderId,
        invoiceId:     `IN-${report._id.toString().slice(-5).toUpperCase()}`,
        customerName:  user ? `${user.fullName} ${user.lastName}`.trim() : "Unknown",
        customerEmail: user?.email || "",
        customerAddress: user?.address || "",
        date:          report.createdAt,
        itemName:      order?.itemName || "",
        // Materials from report rooms
        rooms:         report.rooms || [],
        inspectorName: report.inspectorName,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Queue error:", error);
    res.status(500).json({ message: "Failed to fetch queue", error: error.message });
  }
};

// ── GET invoice queue item details ────────────────────────────────────────────
exports.getInvoiceQueueDetails = async (req, res) => {
  try {
    const { reportId } = req.params;
    const InspectionReport = getReportModel();
    const report = await InspectionReport.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const Order  = getOrderModel();
    const User   = getUserModel();
    const InspectionTicket = require("../models/InspectionTicket.model");
    const ticket = await InspectionTicket.findById(report.ticketId);
    const order  = await Order.findById(report.orderId);
    const user   = await User.findById(ticket?.customerId);

    res.json({
      report,
      order: {
        orderRef: order?.orderRef,
        itemName: order?.itemName,
        amount:   order?.amount,
      },
      customer: {
        name:    user ? `${user.fullName} ${user.lastName}`.trim() : "Unknown",
        email:   user?.email || "",
        address: user?.address || "",
        phone:   user?.phoneNumber || "",
      },
    });
  } catch (error) {
    console.error("getInvoiceQueueDetails error:", error);
    res.status(500).json({ message: "Failed to fetch details", error: error.message });
  }
};

// ── GENERATE invoice from report ──────────────────────────────────────────────
exports.generateInvoice = async (req, res) => {
  try {
    const { reportId } = req.params;
    const InspectionReport = getReportModel();
    const report = await InspectionReport.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    // Check if invoice already exists
    const existing = await Invoice.findOne({ reportId: report._id });
    if (existing) return res.json({ message: "Invoice already exists", invoice: existing });

    const Order  = getOrderModel();
    const User   = getUserModel();
    const InspectionTicket = require("../models/InspectionTicket.model");
    const ticket = await InspectionTicket.findById(report.ticketId);
    const order  = await Order.findById(report.orderId);
    const user   = await User.findById(ticket?.customerId);

    // Build items from report rooms (materials)
    // Main tech is expected to add materials to report rooms
    // For now we generate from order + inspection fee as base
    const items = [];
    let itemNo  = 1;

    // Add main AC unit from order
    if (order?.itemName) {
      items.push({
        no: itemNo++, itemName: order.itemName,
        description: "AC Unit Supply", qty: order?.quantity || 1,
        rate: order?.amount || 0, amount: (order?.quantity || 1) * (order?.amount || 0)
      });
    }

    // Add rooms as installation items
    if (report.rooms && report.rooms.length > 0) {
      report.rooms.forEach((room, i) => {
        items.push({
          no: itemNo++, itemName: `Room ${i+1} Installation`,
          description: room.name || `Room ${i+1}`,
          qty: 1, rate: 5000, amount: 5000
        });
      });
    }

    const serviceCharge = 2000;
    const subTotal      = items.reduce((s, i) => s + i.amount, 0);
    const grandTotal    = subTotal + serviceCharge;

    const invoice = await Invoice.create({
      orderId:         report.orderId,
      customerId:      ticket?.customerId,
      ticketId:        report.ticketId,
      reportId:        report._id,
      customerName:    user ? `${user.fullName} ${user.lastName}`.trim() : "Unknown",
      customerEmail:   user?.email || "",
      customerAddress: user?.address || "",
      items,
      serviceCharge,
      subTotal,
      grandTotal,
      status: "DRAFT",
    });

    res.json({ message: "Invoice generated successfully", invoice });
  } catch (error) {
    console.error("generateInvoice error:", error);
    res.status(500).json({ message: "Failed to generate invoice", error: error.message });
  }
};

// ── GET invoice by ID ─────────────────────────────────────────────────────────
exports.getInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoice", error: error.message });
  }
};

// ── CONFIRM invoice (Finance Officer confirms and moves to PENDING) ────────────
exports.confirmInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    invoice.status = "DRAFT"; // stays draft until sent
    await invoice.save();
    res.json({ message: "Invoice confirmed", invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed to confirm", error: error.message });
  }
};

// ── GET pending invoices ──────────────────────────────────────────────────────
exports.getPendingInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ status: "DRAFT" }).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── SEND invoice to customer (generates PDF + sends email) ────────────────────
exports.sendInvoiceToCustomer = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const acceptLink  = `${FRONTEND_URL}/customer/invoice?invoiceId=${invoice._id}`;
    const rejectionDeadline = new Date();
    rejectionDeadline.setDate(rejectionDeadline.getDate() + 30);

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice);

    // Send email with PDF attachment
    await sendInvoiceEmail(
      invoice.customerEmail,
      invoice.customerName,
      invoice.invoiceNumber,
      invoice.grandTotal,
      acceptLink,
      pdfBuffer
    );

    invoice.status            = "SENT";
    invoice.sentAt            = new Date();
    invoice.rejectionDeadline = rejectionDeadline;
    await invoice.save();

    res.json({ message: "Invoice sent to customer", invoice });
  } catch (error) {
    console.error("sendInvoiceToCustomer error:", error);
    res.status(500).json({ message: "Failed to send invoice", error: error.message });
  }
};

// ── GET invoice for customer (by invoice ID) ──────────────────────────────────
exports.getInvoiceForCustomer = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const daysLeft = invoice.rejectionDeadline
      ? Math.max(0, Math.ceil((new Date(invoice.rejectionDeadline) - new Date()) / (1000*60*60*24)))
      : null;

    res.json({ invoice, daysLeft });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoice", error: error.message });
  }
};

// ── ACCEPT invoice (Customer) ─────────────────────────────────────────────────
exports.acceptInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (!["SENT", "REJECTED"].includes(invoice.status))
      return res.status(400).json({ message: "Invoice cannot be accepted at this stage" });

    const paymentDeadline = new Date();
    paymentDeadline.setDate(paymentDeadline.getDate() + 14);

    invoice.status          = "ACCEPTED";
    invoice.acceptedAt      = new Date();
    invoice.paymentDeadline = paymentDeadline;
    await invoice.save();

    const slipUploadLink = `${FRONTEND_URL}/invoice/upload-payment?invoiceId=${invoice._id}`;
    await sendInvoiceAcceptedEmail(
      invoice.customerEmail,
      invoice.customerName,
      invoice.invoiceNumber,
      invoice.grandTotal,
      paymentDeadline,
      slipUploadLink
    );

    res.json({ message: "Invoice accepted", invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed to accept invoice", error: error.message });
  }
};

// ── REJECT invoice (Customer) ─────────────────────────────────────────────────
exports.rejectInvoice = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: "Rejection reason required" });

    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status !== "SENT")
      return res.status(400).json({ message: "Invoice cannot be rejected at this stage" });

    invoice.status          = "REJECTED";
    invoice.rejectedAt      = new Date();
    invoice.rejectionReason = reason;
    await invoice.save();

    const cancelLink = `${FRONTEND_URL}/customer/invoice?invoiceId=${invoice._id}`;
    await sendInvoiceRejectedEmail(
      invoice.customerEmail,
      invoice.customerName,
      invoice.invoiceNumber,
      reason,
      invoice.rejectionDeadline,
      cancelLink
    );

    res.json({ message: "Invoice rejected", invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject invoice", error: error.message });
  }
};

// ── CANCEL REJECTION (Customer — within 30 days) ──────────────────────────────
exports.cancelRejection = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status !== "REJECTED")
      return res.status(400).json({ message: "Invoice is not in rejected state" });

    // Check 30-day deadline
    if (invoice.rejectionDeadline && new Date() > new Date(invoice.rejectionDeadline))
      return res.status(400).json({ message: "Rejection cancellation period has expired" });

    // Cancel rejection = accept the invoice
    const paymentDeadline = new Date();
    paymentDeadline.setDate(paymentDeadline.getDate() + 14);

    invoice.status          = "ACCEPTED";
    invoice.acceptedAt      = new Date();
    invoice.paymentDeadline = paymentDeadline;
    invoice.rejectionReason = null;
    await invoice.save();

    const slipUploadLink = `${FRONTEND_URL}/invoice/upload-payment?invoiceId=${invoice._id}`;
    await sendInvoiceAcceptedEmail(
      invoice.customerEmail,
      invoice.customerName,
      invoice.invoiceNumber,
      invoice.grandTotal,
      paymentDeadline,
      slipUploadLink
    );

    res.json({ message: "Rejection cancelled. Invoice accepted.", invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed to cancel rejection", error: error.message });
  }
};

// ── GET accepted invoices ─────────────────────────────────────────────────────
exports.getAcceptedInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ status: { $in: ["ACCEPTED", "REJECTION_CANCELLED"] } }).sort({ acceptedAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET rejected invoices ─────────────────────────────────────────────────────
exports.getRejectedInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ status: "REJECTED" }).sort({ rejectedAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET paid invoices ─────────────────────────────────────────────────────────
exports.getPaidInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ status: "PAID" }).sort({ paidAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET auto cancelled invoices ───────────────────────────────────────────────
exports.getAutoCancelledInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ status: "AUTO_CANCELLED" }).sort({ cancelledAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET dashboard stats ───────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const [accepted, pending, paid, rejected] = await Promise.all([
      Invoice.countDocuments({ status: { $in: ["ACCEPTED", "REJECTION_CANCELLED"] } }),
      Invoice.countDocuments({ status: { $in: ["DRAFT", "SENT"] } }),
      Invoice.countDocuments({ status: "PAID" }),
      Invoice.countDocuments({ status: { $in: ["REJECTED", "AUTO_CANCELLED"] } }),
    ]);

    const recent = await Invoice.find().sort({ updatedAt: -1 }).limit(20);

    res.json({ accepted, pending, paid, rejected, tableData: recent });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch stats", error: error.message });
  }
};

// ── GENERATE PDF ──────────────────────────────────────────────────────────────
async function generateInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    try {
      const doc    = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on("data",  chunk => chunks.push(chunk));
      doc.on("end",   ()    => resolve(Buffer.concat(chunks)));
      doc.on("error", err   => reject(err));

      // Header
      doc.fillColor("#1e3a2a").rect(50, 50, 495, 60).fill();
      doc.fillColor("white").fontSize(18).font("Helvetica-Bold")
        .text(`INVOICE #${invoice.invoiceNumber}`, 60, 65);
      doc.fontSize(12).text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}`, 400, 65, { align: "right" });

      // From/To
      doc.fillColor("#1a1a1a").fontSize(14).font("Helvetica-Bold").text("AirLux", 60, 130);
      doc.fontSize(10).font("Helvetica").fillColor("#4b5563")
        .text("Premium Cooling Solutions", 60, 148)
        .text("123 Galle Road, Colombo 03", 60, 162);

      doc.fillColor("#9ca3af").fontSize(9).text("INVOICE TO:", 380, 130);
      doc.fillColor("#1a1a1a").fontSize(10).font("Helvetica-Bold").text(invoice.customerName, 380, 144);
      doc.font("Helvetica").fontSize(10).fillColor("#4b5563")
        .text(invoice.customerAddress || "", 380, 158, { width: 165 });

      // Items table header
      const tableTop = 230;
      doc.fillColor("#1e3a2a").rect(50, tableTop, 495, 25).fill();
      doc.fillColor("white").fontSize(9).font("Helvetica-Bold");
      doc.text("No", 60, tableTop + 8);
      doc.text("Item Name", 90, tableTop + 8);
      doc.text("Description", 220, tableTop + 8);
      doc.text("Qty", 360, tableTop + 8);
      doc.text("Rate (LKR)", 395, tableTop + 8);
      doc.text("Amount (LKR)", 460, tableTop + 8);

      // Items
      let y = tableTop + 30;
      invoice.items.forEach((item, i) => {
        if (i % 2 === 1) {
          doc.fillColor("#f7f9f7").rect(50, y - 5, 495, 22).fill();
        }
        doc.fillColor("#374151").fontSize(9).font("Helvetica");
        doc.text(String(item.no), 60, y);
        doc.text(item.itemName || "", 90, y, { width: 120 });
        doc.text(item.description || "", 220, y, { width: 130 });
        doc.text(String(item.qty), 360, y);
        doc.text(item.rate?.toLocaleString() || "0", 395, y);
        doc.text(item.amount?.toLocaleString() || "0", 460, y);
        y += 22;
      });

      // Totals
      y += 10;
      doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(350, y).lineTo(545, y).stroke();
      y += 8;
      doc.fillColor("#374151").fontSize(10).text("Sub Total:", 370, y);
      doc.font("Helvetica-Bold").text(`LKR ${invoice.subTotal?.toLocaleString()}`, 460, y);
      y += 18;
      doc.font("Helvetica").text("Service Charge:", 355, y);
      doc.text(`LKR ${invoice.serviceCharge?.toLocaleString()}`, 460, y);
      y += 18;
      doc.fillColor("#1e3a2a").rect(350, y, 195, 25).fill();
      doc.fillColor("white").fontSize(11).font("Helvetica-Bold")
        .text("Grand Total:", 360, y + 7)
        .text(`LKR ${invoice.grandTotal?.toLocaleString()}`, 460, y + 7);
      y += 40;

      // Terms
      doc.fillColor("#f0fdf4").rect(50, y, 495, 110).fill();
      doc.fillColor("#1a1a1a").fontSize(9).font("Helvetica-Bold").text("Terms & Conditions", 60, y + 10);
      doc.font("Helvetica").fillColor("#374151").fontSize(8)
        .text("Payment Deadline: Once an invoice is accepted, the customer must complete the payment and upload the payment slip within fourteen (14) calendar days.", 60, y + 25, { width: 475 })
        .text("Rejection Policy: If the invoice is rejected, it can be resumed within one (1) month of the rejection date. After this period, the request will be permanently closed.", 60, y + 52, { width: 475 })
        .text("Failure to upload the payment slip within the 2-week period, the invoice will be automatically cancelled.", 60, y + 79, { width: 475 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ── CRON JOBS ─────────────────────────────────────────────────────────────────
// Run daily at 9 AM
cron.schedule("0 9 * * *", async () => {
  const now = new Date();
  console.log("Running invoice cron jobs...");

  // 1. Auto-cancel invoices where rejection not cancelled within 30 days
  const expiredRejections = await Invoice.find({
    status: "REJECTED",
    rejectionDeadline: { $lt: now },
  });
  for (const inv of expiredRejections) {
    inv.status      = "AUTO_CANCELLED";
    inv.cancelledAt = now;
    await inv.save();
    await sendRejectionExpiredEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber);
    console.log(`Auto-cancelled rejected invoice: ${inv.invoiceNumber}`);
  }

  // 2. Auto-cancel accepted invoices where payment not received in 14 days
  const expiredPayments = await Invoice.find({
    status: "ACCEPTED",
    paymentDeadline: { $lt: now },
  });
  for (const inv of expiredPayments) {
    inv.status      = "AUTO_CANCELLED";
    inv.cancelledAt = now;
    await inv.save();
    await sendAutoCancelledEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber);
    console.log(`Auto-cancelled unpaid invoice: ${inv.invoiceNumber}`);
  }

  // 3. Send rejection warning 2 days before rejection deadline
  const rejectionWarningDate = new Date(now);
  rejectionWarningDate.setDate(rejectionWarningDate.getDate() + 2);
  const rejectionWarnings = await Invoice.find({
    status: "REJECTED",
    rejectionDeadline: {
      $gte: now,
      $lte: rejectionWarningDate,
    },
    rejectionReminderSent: false,
  });
  for (const inv of rejectionWarnings) {
    const daysLeft = Math.ceil((new Date(inv.rejectionDeadline) - now) / (1000*60*60*24));
    await sendRejectionWarningEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber, daysLeft);
    inv.rejectionReminderSent = true;
    await inv.save();
  }

  // 4. Send payment reminder 2 days before payment deadline
  const paymentWarningDate = new Date(now);
  paymentWarningDate.setDate(paymentWarningDate.getDate() + 2);
  const paymentWarnings = await Invoice.find({
    status: "ACCEPTED",
    paymentDeadline: {
      $gte: now,
      $lte: paymentWarningDate,
    },
    paymentReminderSent: false,
  });
  for (const inv of paymentWarnings) {
    const daysLeft = Math.ceil((new Date(inv.paymentDeadline) - now) / (1000*60*60*24));
    await sendPaymentReminderEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber, inv.grandTotal, daysLeft);
    inv.paymentReminderSent = true;
    await inv.save();
  }
});