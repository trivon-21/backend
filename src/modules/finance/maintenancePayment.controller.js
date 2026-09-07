const mongoose = require("mongoose");
const { createLog } = require("./auditLog.controller");
const { sendServiceApprovalEmail, sendServiceRejectionEmail } = require("../shared/notification/email.service");

const getMaintenanceModel = () => {
  try { return mongoose.model("Maintenance"); }
  catch {
    const s = new mongoose.Schema({
      ticketId: String,
      customerId: mongoose.Schema.Types.ObjectId,
      status: String,
      paymentSlipUrl: String,
      paymentAmount: Number,
    }, { strict: false, timestamps: true });
    return mongoose.model("Maintenance", s, "maintenances");
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String, email: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s, "users");
  }
};

// ── GET pending verification — status "Pending" with a slip uploaded ─────────
exports.getPendingVerification = async (req, res) => {
  try {
    const Maintenance = getMaintenanceModel();
    const User = getUserModel();

    const tickets = await Maintenance.find({
      status: "Pending",
      paymentSlipUrl: { $exists: true, $ne: null },
    }).sort({ updatedAt: 1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.serviceType = "MAINTENANCE";
      obj.amount = t.paymentAmount || 0;
      obj.slipUrl = t.paymentSlipUrl;
      if (t.customerId) {
        const user = await User.findById(t.customerId);
        if (user) {
          obj.customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
          obj.customerEmail = user.email || "";
        }
      }
      return obj;
    }));

    res.json(enriched);
  } catch (error) {
    console.error("getPendingVerification (maintenance) error:", error);
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── APPROVE payment ───────────────────────────────────────────────────────────
exports.approvePayment = async (req, res) => {
  try {
    const Maintenance = getMaintenanceModel();
    const User = getUserModel();

    const ticket = await Maintenance.findByIdAndUpdate(
      req.params.id,
      { status: "Finance Approved" },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Maintenance record not found" });

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";

    await createLog({
      eventType:    "SERVICE_PAYMENT_APPROVED",
      paymentType:  "MAINTENANCE",
      ticketId:     ticket.ticketId || ticket._id.toString(),
      customerId:   ticket.customerId,
      customerName,
      customerEmail,
      amount:       ticket.paymentAmount || 0,
      performedBy:  "Finance Officer",
    });

    if (customerEmail) {
      await sendServiceApprovalEmail(customerEmail, customerName, "MAINTENANCE");
    }

    res.json({ message: "Payment approved", ticket });
  } catch (error) {
    console.error("approvePayment (maintenance) error:", error);
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── REJECT payment ────────────────────────────────────────────────────────────
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Reason required" });

    const Maintenance = getMaintenanceModel();
    const User = getUserModel();

    const ticket = await Maintenance.findByIdAndUpdate(
      req.params.id,
      { status: "Finance Rejected" },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Maintenance record not found" });

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";

    await createLog({
      eventType:      "SERVICE_PAYMENT_REJECTED",
      paymentType:    "MAINTENANCE",
      ticketId:       ticket.ticketId || ticket._id.toString(),
      customerId:     ticket.customerId,
      customerName,
      customerEmail,
      amount:         ticket.paymentAmount || 0,
      rejectionReason,
      performedBy:    "Finance Officer",
    });

    if (customerEmail) {
      await sendServiceRejectionEmail(customerEmail, customerName, rejectionReason, "MAINTENANCE");
    }

    res.json({ message: "Payment rejected", ticket });
  } catch (error) {
    console.error("rejectPayment (maintenance) error:", error);
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── GET verified payments ─────────────────────────────────────────────────────
exports.getVerifiedPayments = async (req, res) => {
  try {
    const Maintenance = getMaintenanceModel();
    const User = getUserModel();

    const tickets = await Maintenance.find({ status: "Finance Approved" }).sort({ updatedAt: -1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.serviceType = "MAINTENANCE";
      obj.amount = t.paymentAmount || 0;
      obj.slipUrl = t.paymentSlipUrl;
      if (t.customerId) {
        const user = await User.findById(t.customerId);
        if (user) obj.customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
      }
      return obj;
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── GET rejected payments ─────────────────────────────────────────────────────
exports.getRejectedPayments = async (req, res) => {
  try {
    const Maintenance = getMaintenanceModel();
    const User = getUserModel();

    const tickets = await Maintenance.find({ status: "Finance Rejected" }).sort({ updatedAt: -1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.serviceType = "MAINTENANCE";
      obj.amount = t.paymentAmount || 0;
      obj.slipUrl = t.paymentSlipUrl;
      if (t.customerId) {
        const user = await User.findById(t.customerId);
        if (user) obj.customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
      }
      return obj;
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};