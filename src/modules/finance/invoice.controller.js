const mongoose = require("mongoose");
const Invoice = require("./Invoice.model");
const cron = require("node-cron");
const PDFDocument = require("pdfkit");
const { createLog } = require("./auditLog.controller");

// Lazy model loaders 
const getOrderModel = () => {
  try { return mongoose.model("Order"); }
  catch {
    const s = new mongoose.Schema({
      orderRef: String,
      customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      itemName: String, quantity: Number, amount: Number, orderType: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("Order", s);
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String, email: String,
      phoneNumber: String, role: String, address: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s);
  }
};

const getReportModel = () => {
  try { return mongoose.model("InspectionReport"); }
  catch { return null; }
};

const getTicketModel = () => {
  try { return mongoose.model("InspectionTicket"); }
  catch {
    const s = new mongoose.Schema({
      customerId: mongoose.Schema.Types.ObjectId,
      orderId: mongoose.Schema.Types.ObjectId,
    }, { strict: false, timestamps: true });
    return mongoose.model("InspectionTicket", s);
  }
};

const getLInstallationModel = () => {
  try { return mongoose.model("L_Installation"); }
  catch {
    const s = new mongoose.Schema({
      orderId: mongoose.Schema.Types.ObjectId,
      inspectionTicketId: mongoose.Schema.Types.ObjectId,
      customerId: mongoose.Schema.Types.ObjectId,
      materials: [{ item: String, quantity: mongoose.Schema.Types.Mixed }],
      status: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("L_Installation", s);
  }
};

const getLInventoryModel = () => {
  try { return mongoose.model("L_Inventory"); }
  catch {
    const s = new mongoose.Schema({
      name: String, costPerUnit: Number, unit: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("L_Inventory", s);
  }
};

const getLSellingPriceModel = () => {
  try { return mongoose.model("L_SellingPrice"); }
  catch {
    const s = new mongoose.Schema({
      inventoryId: mongoose.Schema.Types.ObjectId,
      inventoryName: String,
      costPerUnit: Number,
      sellingPricePerUnit: Number,
    }, { strict: false, timestamps: true });
    return mongoose.model("L_SellingPrice", s);
  }
};

function getMaterialName(material) {
  if (!material) return "";
  if (typeof material === "string") return material.trim();
  if (typeof material === "object") {
    return (
      material.name ||
      material.itemName ||
      material.inventoryName ||
      material.description ||
      ""
    ).toString().trim();
  }
  return String(material).trim();
}

const getLChargeModel = () => {
  try { return mongoose.model("L_Charge"); }
  catch {
    const s = new mongoose.Schema({
      name: String, amount: Number, type: String, description: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("L_Charge", s);
  }
};

const { sendInvoiceEmail, sendInvoiceAcceptedEmail, sendInvoiceRejectedEmail,
  sendPaymentReminderEmail, sendAutoCancelledEmail,
  sendRejectionWarningEmail, sendRejectionExpiredEmail
} = require("../shared/notification/invoiceEmail.service");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

// ── Helper: find selling price for a material name ────────────────────────────
async function getSellingPrice(materialName) {
  const LInventory = getLInventoryModel();
  const LSellingPrice = getLSellingPriceModel();
  const name = getMaterialName(materialName);
  if (!name) return null;

  let inventory = await LInventory.findOne({ name });
  if (!inventory) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    inventory = await LInventory.findOne({
      $or: [
        { name: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ],
    });
  }
  if (!inventory) {
    const sellingPrice = await LSellingPrice.findOne({
      inventoryName: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: "i" },
    });
    return sellingPrice ? sellingPrice.sellingPricePerUnit : null;
  }

  const sp = await LSellingPrice.findOne({ inventoryId: inventory._id });
  return sp ? sp.sellingPricePerUnit : inventory.costPerUnit;
}

// ── Helper: get fixed charge by name ─────────────────────────────────────────
async function getCharge(chargeName) {
  const LCharge = getLChargeModel();
  const charge = await LCharge.findOne({ name: chargeName });
  return charge ? charge.amount : 0;
}

async function resolveInvoiceSource(reportId) {
  const InspectionReport = getReportModel();
  const LInstallation = getLInstallationModel();

  let report = null;
  if (InspectionReport) {
    report = await InspectionReport.findById(reportId);
  }

  let installation = null;
  if (!report) {
    installation = await LInstallation.findById(reportId);
    if (!installation) {
      installation = await LInstallation.findOne({
        $or: [
          { orderId: reportId },
          { inspectionTicketId: reportId },
        ],
      });
    }
  }

  if (!report && installation) {
    report = {
      _id: installation._id,
      orderId: installation.orderId,
      ticketId: installation.inspectionTicketId,
      itemName: installation.productType || "",
      submittedAt: installation.updatedAt || installation.createdAt,
      updatedAt: installation.updatedAt || installation.createdAt,
    };
  }

  return { report, installation };
}

// ── GET invoice queue ─────────────────────────────────────────────────────────
exports.getInvoiceQueue = async (req, res) => {
  try {
    const InspectionReport = getReportModel();
    if (!InspectionReport) return res.json([]);

    const Order = getOrderModel();
    const User = getUserModel();
    const LInstallation = getLInstallationModel();
    const Ticket = getTicketModel();

    const installations = await LInstallation.find({});

    const result = [];

    for (const installation of installations) {
      const existingInvoice = await Invoice.findOne({ orderId: installation.orderId });
      if (existingInvoice) continue;

      const report = await InspectionReport.findOne({
        $or: [
          { orderId: installation.orderId },
          { ticketId: installation.inspectionTicketId },
        ],
        status: "SUBMITTED",
      });
      const order = await Order.findById(installation.orderId);

      let user = await User.findById(installation.customerId);
      if (!user && installation.inspectionTicketId) {
        const ticket = await Ticket.findById(installation.inspectionTicketId);
        if (ticket?.customerId) user = await User.findById(ticket.customerId);
      }

      result.push({
        reportId: report ? report._id : installation._id,
        installationId: installation._id,
        ticketId: installation.inspectionTicketId,
        orderId: order?._id || installation.orderId,
        orderRef: order?.orderRef || installation.orderId?.toString().slice(-6).toUpperCase(),
        invoiceId: `IN-${installation._id.toString().slice(-5).toUpperCase()}`,
        customerName: user
          ? `${user.fullName || ""} ${user.lastName || ""}`.trim() || user.name || "Unknown"
          : "Unknown",
        customerEmail: user?.email || "",
        customerAddress: user?.address || installation.location || "",
        date: report ? (report.submittedAt || report.updatedAt) : (installation.updatedAt || installation.createdAt),
        itemName: order?.itemName || order?.items?.[0]?.name || order?.items?.[0]?.itemName || installation.productType || "",
        acModel: order?.itemName || order?.items?.[0]?.name || order?.items?.[0]?.itemName || installation.productType || "",
        materialsCount: installation.materials?.length || 0,
        location: installation.location || "",
      });
    }

    res.json(result);
  } catch (error) {
    console.error("getInvoiceQueue error:", error);
    res.status(500).json({ message: "Failed to fetch queue", error: error.message });
  }
};

// ── GET invoice queue item details ────────────────────────────────────────────
exports.getInvoiceQueueDetails = async (req, res) => {
  try {
    const { reportId } = req.params;
    const resolved = await resolveInvoiceSource(reportId);
    const report = resolved.report;
    const installation = resolved.installation;
    if (!report && !installation) return res.status(404).json({ message: "Report not found" });

    const Order = getOrderModel();
    const User = getUserModel();
    const LInstallation = getLInstallationModel();
    const Ticket = getTicketModel();

    const ticket = await Ticket.findById(report.ticketId);
    const order = await Order.findById(report.orderId);
    const user = await User.findById(ticket?.customerId || report.customerId);
    const resolvedInstallation = installation || await LInstallation.findOne({
      $or: [
        { orderId: report.orderId },
        { inspectionTicketId: report.ticketId },
      ]
    });

    res.json({
      report,
      order: {
        orderRef: order?.orderRef,
        itemName: order?.itemName || order?.items?.[0]?.name || order?.items?.[0]?.itemName || report.itemName || "",
        amount: order?.amount || order?.total || order?.subtotal || 0,
      },
      customer: {
        name: user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Unknown",
        email: user?.email || "",
        address: user?.address || "",
        phone: user?.phoneNumber || "",
      },
      materials: resolvedInstallation?.materials || [],
      materialsCount: resolvedInstallation?.materials?.length || 0,
    });
  } catch (error) {
    console.error("getInvoiceQueueDetails error:", error);
    res.status(500).json({ message: "Failed to fetch details", error: error.message });
  }
};

// ── GENERATE invoice ──────────────────────────────────────────────────────────
exports.generateInvoice = async (req, res) => {
  try {
    const { reportId } = req.params;

    const InspectionReport = getReportModel();
    const Order = getOrderModel();
    const User = getUserModel();
    const LInstallation = getLInstallationModel();
    const Ticket = getTicketModel();

    const resolved = await resolveInvoiceSource(reportId);
    const report = resolved.report;
    const installation = resolved.installation;
    if (!report && !installation) return res.status(404).json({ message: "Report not found" });

    const existing = await Invoice.findOne({ orderId: report.orderId });
    if (existing) {
      return res.json({ message: "Invoice already exists", invoice: existing });
    }

    const resolvedInstallation = installation || await LInstallation.findOne({
      $or: [
        { orderId: report.orderId },
        { inspectionTicketId: report.ticketId },
      ]
    });
    if (!resolvedInstallation || !resolvedInstallation.materials || resolvedInstallation.materials.length === 0) {
      return res.status(400).json({ message: "No materials found in installation record. Main technician must add materials first." });
    }

    const ticket = await Ticket.findById(report.ticketId);
    const order = await Order.findById(report.orderId);

    let user = null;
    if (resolvedInstallation.customerId) user = await User.findById(resolvedInstallation.customerId);
    if (!user && ticket?.customerId) user = await User.findById(ticket.customerId);

    const customerName = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() || "Unknown" : "Unknown";
    const customerEmail = user?.email || "";
    const customerAddress = user?.address || resolvedInstallation.location || "";

    const items = [];
    let itemNo = 1;

    const acModelName = order?.itemName || order?.items?.[0]?.name || order?.items?.[0]?.itemName || resolvedInstallation.productType || "";
    const acQty = Number(order?.quantity || order?.items?.[0]?.quantity || resolvedInstallation.units || 1) || 1;
    const acPrice = Number(order?.amount || order?.total || order?.subtotal || order?.items?.[0]?.price || 0) || 0;

    if (acModelName || acPrice > 0) {
      items.push({
        no: itemNo++,
        itemName: acModelName || "AC Unit",
        description: "AC Unit Supply",
        qty: acQty,
        rate: acPrice,
        amount: acQty * acPrice,
      });
    }

    for (const material of resolvedInstallation.materials) {
      const qty = Number(material.quantity) || 1;
      const materialName = getMaterialName(material.item);
      const unitPrice = await getSellingPrice(materialName) || 0;

      items.push({
        no: itemNo++,
        itemName: materialName || "Material",
        description: `Installation material`,
        qty: qty,
        rate: unitPrice,
        amount: qty * unitPrice,
      });
    }

    const installationCharge = await getCharge("installation") || 10000;
    items.push({
      no: itemNo++,
      itemName: "Installation Charge",
      description: "Fixed installation service charge",
      qty: 1,
      rate: installationCharge,
      amount: installationCharge,
    });

    const subTotal = items.reduce((s, i) => s + (i.amount || 0), 0);
    const serviceCharge = 0;
    const grandTotal = subTotal + serviceCharge;

    const invoice = new Invoice({
      orderId: resolvedInstallation.orderId || report.orderId,
      customerId: resolvedInstallation.customerId || ticket?.customerId,
      ticketId: resolvedInstallation.inspectionTicketId || report.ticketId,
      reportId: report._id,
      invoiceType: "INSTALLATION",
      customerName,
      customerEmail,
      customerAddress,
      items,
      serviceCharge,
      subTotal,
      grandTotal,
      status: "DRAFT",
    });
    await invoice.save();

    await createLog({
      eventType: "INVOICE_GENERATED",
      paymentType: "INVOICE",
      orderId: (resolvedInstallation.orderId || report.orderId)?.toString() || "",
      invoiceId: invoice.invoiceNumber || invoice._id.toString(),
      customerId: resolvedInstallation.customerId || ticket?.customerId,
      customerName,
      customerEmail,
      amount: grandTotal,
      performedBy: "Finance Officer",
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

// ── CONFIRM invoice ───────────────────────────────────────────────────────────
exports.confirmInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    invoice.status = "DRAFT";
    await invoice.save();
    res.json({ message: "Invoice confirmed", invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed to confirm", error: error.message });
  }
};

// ── GET pending invoices ──────────────────────────────────────────────────────
exports.getPendingInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({
      status: "DRAFT",
      invoiceType: { $ne: "REPAIR" }
    }).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── SEND invoice to customer ──────────────────────────────────────────────────
exports.sendInvoiceToCustomer = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const acceptLink = `${FRONTEND_URL}/customer/invoice?invoiceId=${invoice._id}`;
    const rejectionDeadline = new Date();
    rejectionDeadline.setDate(rejectionDeadline.getDate() + 30);

    const pdfBuffer = await generateInvoicePDF(invoice);

    await sendInvoiceEmail(
      invoice.customerEmail,
      invoice.customerName,
      invoice.invoiceNumber,
      invoice.grandTotal,
      acceptLink,
      pdfBuffer
    );

    invoice.status = "SENT";
    invoice.sentAt = new Date();
    invoice.rejectionDeadline = rejectionDeadline;
    await invoice.save();

    await createLog({
      eventType: "INVOICE_SENT",
      paymentType: "INVOICE",
      orderId: invoice.orderId?.toString() || "",
      invoiceId: invoice.invoiceNumber || invoice._id.toString(),
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      amount: invoice.grandTotal || 0,
      performedBy: "Finance Officer",
    });

    res.json({ message: "Invoice sent to customer", invoice });
  } catch (error) {
    console.error("sendInvoiceToCustomer error:", error);
    res.status(500).json({ message: "Failed to send invoice", error: error.message });
  }
};

// ── GET invoice for customer ──────────────────────────────────────────────────
exports.getInvoiceForCustomer = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const daysLeft = invoice.rejectionDeadline
      ? Math.max(0, Math.ceil((new Date(invoice.rejectionDeadline) - new Date()) / (1000 * 60 * 60 * 24)))
      : null;

    res.json({ invoice, daysLeft });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoice", error: error.message });
  }
};

// ── ACCEPT invoice ────────────────────────────────────────────────────────────
exports.acceptInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (!["SENT", "REJECTED"].includes(invoice.status))
      return res.status(400).json({ message: "Invoice cannot be accepted at this stage" });

    const paymentDeadline = new Date();
    paymentDeadline.setDate(paymentDeadline.getDate() + 14);

    invoice.status = "ACCEPTED";
    invoice.acceptedAt = new Date();
    invoice.paymentDeadline = paymentDeadline;
    await invoice.save();

    await createLog({
      eventType: "INVOICE_ACCEPTED",
      paymentType: "INVOICE",
      orderId: invoice.orderId?.toString() || "",
      invoiceId: invoice.invoiceNumber || invoice._id.toString(),
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      amount: invoice.grandTotal || 0,
      performedBy: "Customer",
    });

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

// ── REJECT invoice ────────────────────────────────────────────────────────────
exports.rejectInvoice = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: "Rejection reason required" });

    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status !== "SENT")
      return res.status(400).json({ message: "Invoice cannot be rejected at this stage" });

    invoice.status = "REJECTED";
    invoice.rejectedAt = new Date();
    invoice.rejectionReason = reason;
    await invoice.save();

    await createLog({
      eventType: "INVOICE_REJECTED",
      paymentType: "INVOICE",
      orderId: invoice.orderId?.toString() || "",
      invoiceId: invoice.invoiceNumber || invoice._id.toString(),
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      amount: invoice.grandTotal || 0,
      rejectionReason: reason,
      performedBy: "Customer",
    });

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

// ── CANCEL REJECTION ──────────────────────────────────────────────────────────
exports.cancelRejection = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status !== "REJECTED")
      return res.status(400).json({ message: "Invoice is not in rejected state" });

    if (invoice.rejectionDeadline && new Date() > new Date(invoice.rejectionDeadline))
      return res.status(400).json({ message: "Rejection cancellation period has expired" });

    const paymentDeadline = new Date();
    paymentDeadline.setDate(paymentDeadline.getDate() + 14);

    invoice.status = "ACCEPTED";
    invoice.acceptedAt = new Date();
    invoice.paymentDeadline = paymentDeadline;
    invoice.rejectionReason = null;
    await invoice.save();

    await createLog({
      eventType: "INVOICE_REJECTION_CANCELLED",
      paymentType: "INVOICE",
      orderId: invoice.orderId?.toString() || "",
      invoiceId: invoice.invoiceNumber || invoice._id.toString(),
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerEmail: invoice.customerEmail,
      amount: invoice.grandTotal || 0,
      performedBy: "Customer",
    });

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
    const invoices = await Invoice.find({
      status: { $in: ["ACCEPTED", "REJECTION_CANCELLED"] },
      invoiceType: { $ne: "REPAIR" }
    }).sort({ acceptedAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET rejected invoices ─────────────────────────────────────────────────────
exports.getRejectedInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({
      status: "REJECTED",
      invoiceType: { $ne: "REPAIR" }
    }).sort({ rejectedAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET paid invoices ─────────────────────────────────────────────────────────
exports.getPaidInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({
      status: "PAID",
      invoiceType: { $ne: "REPAIR" }
    }).sort({ paidAt: -1, updatedAt: -1 });

    const result = invoices.map(inv => {
      const obj = inv.toObject();
      if (!obj.paidAt) obj.paidAt = obj.updatedAt;
      return obj;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── MARK AS PAID ──────────────────────────────────────────────────────────────
exports.markAsPaid = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { status: "PAID", paidAt: new Date() },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    await createLog({
      paymentType:   "INVOICE",
      eventType:     "INVOICE_PAID",
      orderId:       invoice.orderId?.toString() || "",
      invoiceId:     invoice.invoiceNumber || invoice._id.toString(),
      customerName:  invoice.customerName,
      customerEmail: invoice.customerEmail,
      amount:        invoice.grandTotal,
      performedBy:   "Finance Officer",
    });

    res.json({ message: "Invoice marked as paid", invoice });
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── AUTO CANCEL HELPER ────────────────────────────────────────────────────────
async function processAutoCancelJobs() {
  const now = new Date();

  const expiredRejections = await Invoice.find({
    status: "REJECTED",
    rejectionDeadline: { $lt: now },
  });
  for (const inv of expiredRejections) {
    inv.status = "AUTO_CANCELLED";
    inv.cancelledAt = now;
    await inv.save();
    await sendRejectionExpiredEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber);
  }

  const expiredPayments = await Invoice.find({
    status: "ACCEPTED",
    paymentDeadline: { $lt: now },
  });
  for (const inv of expiredPayments) {
    inv.status = "AUTO_CANCELLED";
    inv.cancelledAt = now;
    await inv.save();
    await sendAutoCancelledEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber);
  }
}

// ── GET auto cancelled invoices ───────────────────────────────────────────────
exports.getAutoCancelledInvoices = async (req, res) => {
  try {
    await processAutoCancelJobs();
    const invoices = await Invoice.find({
      status: "AUTO_CANCELLED",
      invoiceType: { $ne: "REPAIR" }
    }).sort({ cancelledAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET dashboard stats ───────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const [accepted, pending, paid, rejected] = await Promise.all([
      Invoice.countDocuments({ status: { $in: ["ACCEPTED", "REJECTION_CANCELLED"] }, invoiceType: { $ne: "REPAIR" } }),
      Invoice.countDocuments({ status: { $in: ["DRAFT", "SENT"] }, invoiceType: { $ne: "REPAIR" } }),
      Invoice.countDocuments({ status: "PAID", invoiceType: { $ne: "REPAIR" } }),
      Invoice.countDocuments({ status: { $in: ["REJECTED", "AUTO_CANCELLED"] }, invoiceType: { $ne: "REPAIR" } }),
    ]);
    const recent = await Invoice.find({ invoiceType: { $ne: "REPAIR" } }).sort({ updatedAt: -1 }).limit(20);
    res.json({ accepted, pending, paid, rejected, tableData: recent });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch stats", error: error.message });
  }
};

// ── DEBUG ─────────────────────────────────────────────────────────────────────
exports.debugInvoiceQueue = async (req, res) => {
  try {
    const InspectionReport = getReportModel();
    const LInstallation = getLInstallationModel();
    const Order = getOrderModel();

    const allReports = await InspectionReport.find({}).limit(10);
    const allInstallations = await LInstallation.find({}).limit(10);
    const submittedReports = await InspectionReport.find({ status: "SUBMITTED" }).limit(10);

    const reportDetails = [];
    for (const report of submittedReports) {
      const installation = await LInstallation.findOne({
        $or: [{ orderId: report.orderId }, { inspectionTicketId: report.ticketId }]
      });
      const order = await Order.findById(report.orderId);
      reportDetails.push({
        reportId: report._id,
        reportStatus: report.status,
        orderId: report.orderId,
        orderRef: order?.orderRef,
        hasInstallation: !!installation,
        installationId: installation?._id,
        materialsCount: installation?.materials?.length || 0,
        ticketId: report.ticketId,
      });
    }

    res.json({
      totalReports: allReports.length,
      totalInstallations: allInstallations.length,
      submittedReportsCount: submittedReports.length,
      allReports: allReports.map(r => ({ id: r._id, status: r.status, orderId: r.orderId, ticketId: r.ticketId })),
      allInstallations: allInstallations.map(i => ({ id: i._id, orderId: i.orderId, inspectionTicketId: i.inspectionTicketId, materialsCount: i.materials?.length || 0 })),
      reportDetails,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ message: "Debug error", error: error.message });
  }
};

// ── GENERATE PDF ──────────────────────────────────────────────────────────────
async function generateInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on("data", chunk => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", err => reject(err));

      doc.fillColor("#1e3a2a").rect(50, 50, 495, 60).fill();
      doc.fillColor("white").fontSize(18).font("Helvetica-Bold")
        .text(`INVOICE #${invoice.invoiceNumber}`, 60, 65);
      const dateStr = `Date: ${new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`;
      doc.fillColor("white").fontSize(10).font("Helvetica")
        .text(dateStr, 300, 72, { width: 235, align: "right" });

      doc.fillColor("#1a1a1a").fontSize(14).font("Helvetica-Bold").text("AirLux", 60, 130);
      doc.fontSize(10).font("Helvetica").fillColor("#4b5563")
        .text("Premium Cooling Solutions", 60, 148)
        .text("123 Galle Road, Colombo 03", 60, 162);

      doc.fillColor("#9ca3af").fontSize(9).text("INVOICE TO:", 380, 130);
      doc.fillColor("#1a1a1a").fontSize(10).font("Helvetica-Bold").text(invoice.customerName || "", 380, 144);
      doc.font("Helvetica").fontSize(10).fillColor("#4b5563")
        .text(invoice.customerAddress || "", 380, 158, { width: 165 });

      const tableTop = 230;
      doc.fillColor("#1e3a2a").rect(50, tableTop, 495, 25).fill();
      doc.fillColor("white").fontSize(9).font("Helvetica-Bold");
      ["No", "Item Name", "Description", "Qty", "Rate (LKR)", "Amount (LKR)"].forEach((h, i) => {
        const x = [60, 90, 220, 360, 395, 460][i];
        doc.text(h, x, tableTop + 8);
      });

      let y = tableTop + 30;
      (invoice.items || []).forEach((item, i) => {
        if (i % 2 === 1) doc.fillColor("#f7f9f7").rect(50, y - 5, 495, 22).fill();
        doc.fillColor("#374151").fontSize(9).font("Helvetica");
        doc.text(String(item.no || i + 1), 60, y);
        doc.text((item.itemName || "").substring(0, 20), 90, y, { width: 125 });
        doc.text((item.description || "").substring(0, 25), 220, y, { width: 130 });
        doc.text(String(item.qty || 1), 360, y);
        doc.text((item.rate || 0).toLocaleString(), 395, y);
        doc.text((item.amount || 0).toLocaleString(), 460, y);
        y += 22;
      });

      y += 10;
      doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(350, y).lineTo(545, y).stroke();
      y += 8;
      doc.fillColor("#374151").fontSize(10).font("Helvetica")
        .text("Sub Total:", 370, y);
      doc.font("Helvetica-Bold")
        .text(`LKR ${(invoice.subTotal || 0).toLocaleString()}`, 460, y);
      y += 18;
      if (invoice.serviceCharge > 0) {
        doc.font("Helvetica").text("Service Charge:", 355, y);
        doc.text(`LKR ${(invoice.serviceCharge || 0).toLocaleString()}`, 460, y);
        y += 18;
      }
      doc.fillColor("#1e3a2a").rect(350, y, 195, 25).fill();
      doc.fillColor("white").fontSize(11).font("Helvetica-Bold")
        .text("Grand Total:", 360, y + 7)
        .text(`LKR ${(invoice.grandTotal || 0).toLocaleString()}`, 455, y + 7);
      y += 40;

      if (y < 680) {
        doc.fillColor("#f0fdf4").rect(50, y, 495, 100).fill();
        doc.fillColor("#1a1a1a").fontSize(9).font("Helvetica-Bold").text("Terms & Conditions", 60, y + 10);
        doc.font("Helvetica").fillColor("#374151").fontSize(8)
          .text("Payment Deadline: Once an invoice is accepted, the customer must complete the payment and upload the payment slip within fourteen (14) calendar days.", 60, y + 25, { width: 475 })
          .text("Rejection Policy: If the invoice is rejected, it can be resumed within one (1) month of the rejection date. After this period, the request will be permanently closed.", 60, y + 50, { width: 475 })
          .text("Failure to upload the payment slip within the 2-week period, the invoice will be automatically cancelled.", 60, y + 75, { width: 475 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ── REPAIR INVOICE HELPERS ────────────────────────────────────────────────────
const getLRepairModel = () => {
  try { return mongoose.model("L_Repair"); }
  catch {
    const s = new mongoose.Schema({
      serviceTicketId: mongoose.Schema.Types.ObjectId,
      customerId:      mongoose.Schema.Types.ObjectId,
      orderId:         mongoose.Schema.Types.ObjectId,
      repairType:      String,
      materials:       [{ item: String, quantity: mongoose.Schema.Types.Mixed }],
      location:        String,
      status:          String,
    }, { strict: false, timestamps: true });
    return mongoose.model("L_Repair", s);
  }
};

// ── GET repair invoice queue ──────────────────────────────────────────────────
exports.getRepairInvoiceQueue = async (req, res) => {
  try {
    const LRepair  = getLRepairModel();
    const User     = getUserModel();
    const Ticket   = getTicketModel();

    const repairs = await LRepair.find({
      "materials.0": { $exists: true },
      status: { $in: ["MATERIALS_READY", "PENDING"] },
    });

    const result = [];

    for (const repair of repairs) {
      const existing = await Invoice.findOne({ repairId: repair._id });
      if (existing) continue;

      let customerName  = "Unknown";
      let customerEmail = "";
      let customerAddress = "";

      if (repair.customerId) {
        const user = await User.findById(repair.customerId);
        if (user) {
          customerName    = `${user.fullName || ""} ${user.lastName || ""}`.trim();
          customerEmail   = user.email || "";
          customerAddress = user.address || repair.location || "";
        }
      }

      let ticketRef = "—";
      let serviceType = "REPAIR";
      if (repair.serviceTicketId) {
        try {
          const ServiceTicket = mongoose.model("ServiceTicket");
          const ticket = await ServiceTicket.findById(repair.serviceTicketId);
          if (ticket) {
            ticketRef   = `SVC-${ticket._id.toString().slice(-5).toUpperCase()}`;
            serviceType = ticket.serviceType || "REPAIR";
          }
        } catch {}
      }

      result.push({
        repairId:       repair._id,
        serviceTicketId:repair.serviceTicketId,
        ticketRef,
        customerId:     repair.customerId,
        customerName,
        customerEmail,
        customerAddress,
        repairType:     repair.repairType || "minor",
        materialsCount: repair.materials.length,
        location:       repair.location || "",
        date:           repair.updatedAt || repair.createdAt,
        notes:          repair.notes || "",
      });
    }

    res.json(result);
  } catch (error) {
    console.error("getRepairInvoiceQueue error:", error);
    res.status(500).json({ message: "Failed to fetch repair queue", error: error.message });
  }
};

// ── GENERATE repair invoice ───────────────────────────────────────────────────
exports.generateRepairInvoice = async (req, res) => {
  try {
    const { repairId } = req.params;
    const LRepair = getLRepairModel();
    const User    = getUserModel();

    const repair = await LRepair.findById(repairId);
    if (!repair) return res.status(404).json({ message: "Repair record not found" });

    const existing = await Invoice.findOne({ repairId: repair._id });
    if (existing) return res.json({ message: "Repair invoice already exists", invoice: existing });

    let user = null;
    if (repair.customerId) user = await User.findById(repair.customerId);

    const customerName    = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Unknown";
    const customerEmail   = user?.email || "";
    const customerAddress = user?.address || repair.location || "";

    const items  = [];
    let   itemNo = 1;

    for (const material of repair.materials) {
      const qty       = Number(material.quantity) || 1;
      const materialName = getMaterialName(material.item);
      const unitPrice = await getSellingPrice(materialName) || 0;
      items.push({
        no:          itemNo++,
        itemName:    materialName || "Material",
        description: "Repair material",
        qty,
        rate:        unitPrice,
        amount:      qty * unitPrice,
      });
    }

    const repairType    = repair.repairType || "minor";
    const chargeName    = repairType === "major" ? "repair_major" : "repair_minor";
    const chargeLabel   = repairType === "major" ? "Major Repair Charge" : "Minor Repair Charge";
    const repairCharge  = await getCharge(chargeName) || (repairType === "major" ? 15000 : 4000);
    items.push({
      no:          itemNo++,
      itemName:    chargeLabel,
      description: `Fixed ${repairType} repair service charge`,
      qty:         1,
      rate:        repairCharge,
      amount:      repairCharge,
    });

    const subTotal   = items.reduce((s, i) => s + (i.amount || 0), 0);
    const grandTotal = subTotal;

    const invoice = new Invoice({
      repairId:        repair._id,
      customerId:      repair.customerId,
      ticketId:        repair.serviceTicketId,
      invoiceType:     "REPAIR",
      customerName,
      customerEmail,
      customerAddress,
      items,
      serviceCharge:   0,
      subTotal,
      grandTotal,
      status:          "DRAFT",
    });
    await invoice.save();

    repair.status = "INVOICED";
    await repair.save();

    await createLog({
      eventType:    "INVOICE_GENERATED",
      paymentType:  "INVOICE",
      invoiceId:    invoice.invoiceNumber || invoice._id.toString(),
      customerId:   repair.customerId,
      customerName,
      customerEmail,
      amount:       grandTotal,
      performedBy:  "Finance Officer",
      notes:        `Repair invoice (${repairType})`,
    });

    res.json({ message: "Repair invoice generated", invoice });
  } catch (error) {
    console.error("generateRepairInvoice error:", error);
    res.status(500).json({ message: "Failed to generate repair invoice", error: error.message });
  }
};

// ── GET repair invoices by status ─────────────────────────────────────────────
exports.getRepairPendingInvoices = async (req, res) => {
  try { res.json(await Invoice.find({ invoiceType: "REPAIR", status: "DRAFT" }).sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ message: e.message }); }
};
exports.getRepairAcceptedInvoices = async (req, res) => {
  try { res.json(await Invoice.find({ invoiceType: "REPAIR", status: { $in: ["ACCEPTED", "REJECTION_CANCELLED"] } }).sort({ acceptedAt: -1 })); }
  catch (e) { res.status(500).json({ message: e.message }); }
};
exports.getRepairRejectedInvoices = async (req, res) => {
  try { res.json(await Invoice.find({ invoiceType: "REPAIR", status: "REJECTED" }).sort({ rejectedAt: -1 })); }
  catch (e) { res.status(500).json({ message: e.message }); }
};
exports.getRepairPaidInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ invoiceType: "REPAIR", status: "PAID" }).sort({ paidAt: -1, updatedAt: -1 });
    res.json(invoices.map(inv => { const o = inv.toObject(); if (!o.paidAt) o.paidAt = o.updatedAt; return o; }));
  } catch (e) { res.status(500).json({ message: e.message }); }
};
exports.getRepairAutoCancelledInvoices = async (req, res) => {
  try {
    await processAutoCancelJobs();
    res.json(await Invoice.find({ invoiceType: "REPAIR", status: "AUTO_CANCELLED" }).sort({ cancelledAt: -1 }));
  } catch (e) { res.status(500).json({ message: e.message }); }
};
exports.getRepairDashboardStats = async (req, res) => {
  try {
    const [accepted, pending, paid, rejected] = await Promise.all([
      Invoice.countDocuments({ invoiceType: "REPAIR", status: { $in: ["ACCEPTED", "REJECTION_CANCELLED"] } }),
      Invoice.countDocuments({ invoiceType: "REPAIR", status: { $in: ["DRAFT", "SENT"] } }),
      Invoice.countDocuments({ invoiceType: "REPAIR", status: "PAID" }),
      Invoice.countDocuments({ invoiceType: "REPAIR", status: { $in: ["REJECTED", "AUTO_CANCELLED"] } }),
    ]);
    const tableData = await Invoice.find({ invoiceType: "REPAIR" }).sort({ updatedAt: -1 }).limit(50);
    res.json({ accepted, pending, paid, rejected, tableData });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── CRON JOBS ─────────────────────────────────────────────────────────────────
cron.schedule("0 9 * * *", async () => {
  const now = new Date();
  console.log("Running invoice cron jobs...");

  const expiredRejections = await Invoice.find({
    status: "REJECTED", rejectionDeadline: { $lt: now },
  });
  for (const inv of expiredRejections) {
    inv.status = "AUTO_CANCELLED"; inv.cancelledAt = now;
    await inv.save();
    await sendRejectionExpiredEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber);
  }

  const expiredPayments = await Invoice.find({
    status: "ACCEPTED", paymentDeadline: { $lt: now },
  });
  for (const inv of expiredPayments) {
    inv.status = "AUTO_CANCELLED"; inv.cancelledAt = now;
    await inv.save();
    await sendAutoCancelledEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber);
  }

  const rWarnDate = new Date(now); rWarnDate.setDate(rWarnDate.getDate() + 2);
  const rejectionWarnings = await Invoice.find({
    status: "REJECTED",
    rejectionDeadline: { $gte: now, $lte: rWarnDate },
    rejectionReminderSent: false,
  });
  for (const inv of rejectionWarnings) {
    const d = Math.ceil((new Date(inv.rejectionDeadline) - now) / (1000 * 60 * 60 * 24));
    await sendRejectionWarningEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber, d);
    inv.rejectionReminderSent = true; await inv.save();
  }

  const pWarnDate = new Date(now); pWarnDate.setDate(pWarnDate.getDate() + 2);
  const paymentWarnings = await Invoice.find({
    status: "ACCEPTED",
    paymentDeadline: { $gte: now, $lte: pWarnDate },
    paymentReminderSent: false,
  });
  for (const inv of paymentWarnings) {
    const d = Math.ceil((new Date(inv.paymentDeadline) - now) / (1000 * 60 * 60 * 24));
    await sendPaymentReminderEmail(inv.customerEmail, inv.customerName, inv.invoiceNumber, inv.grandTotal, d);
    inv.paymentReminderSent = true; await inv.save();
  }
});