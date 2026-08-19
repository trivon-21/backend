const mongoose = require("mongoose");
const { createLog } = require("./auditLog.controller");
const { sendServiceApprovalEmail, sendServiceRejectionEmail } = require("../shared/notification/email.service");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

// ── Model loader — strict:false lets us add payment fields to team's documents ─
const getServiceTicketModel = () => {
  try { return mongoose.model("ServiceTicket"); }
  catch {
    const s = new mongoose.Schema({
      customerId:      mongoose.Schema.Types.ObjectId,
      orderId:         mongoose.Schema.Types.ObjectId,
      serviceType:     String,
      requestType:     String,
      category:        String,
      serviceFee:      { type: Number, default: 0 },
      paymentStatus:   String,
      paymentSlipUrl:  String,
      slipUploadedAt:  Date,
      approvedAt:      Date,
      rejectedAt:      Date,
      rejectionReason: String,
      status:          String,
    }, { strict: false, timestamps: true });
    return mongoose.model("ServiceTicket", s, "service_tickets");
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String,
      email: String, phoneNumber: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s, "users");
  }
};

// ── Helper: resolve serviceType from team's document ─────────────────────────
const resolveServiceType = (ticket) => {
  if (ticket.serviceType) return ticket.serviceType.toUpperCase();
  if (ticket.requestType) {
    const rt = ticket.requestType.toLowerCase();
    if (rt.includes("repair"))      return "REPAIR";
    if (rt.includes("maintenance")) return "MAINTENANCE";
    return ticket.requestType.toUpperCase();
  }
  if (ticket.category) {
    const cat = ticket.category.toLowerCase();
    if (cat.includes("repair"))      return "REPAIR";
    if (cat.includes("maintenance")) return "MAINTENANCE";
  }
  return "REPAIR";
};

// ── GET pending verification ──────────────────────────────────────────────────
exports.getPendingVerification = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const ServiceTicket = getServiceTicketModel();
    const User = getUserModel();

    const query = { paymentStatus: "UNDER_REVIEW" };

    // Match by serviceType, requestType, or category
    if (serviceType) {
      query.$or = [
        { serviceType: { $regex: serviceType, $options: "i" } },
        { requestType: { $regex: serviceType, $options: "i" } },
        { category:    { $regex: serviceType, $options: "i" } },
      ];
    }

    const tickets = await ServiceTicket.find(query).sort({ createdAt: 1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.serviceType = resolveServiceType(t);
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

// ── UPLOAD slip ───────────────────────────────────────────────────────────────
exports.uploadSlip = async (req, res) => {
  try {
    const { slipUrl } = req.body;
    if (!slipUrl) return res.status(400).json({ message: "Slip required" });

    const ServiceTicket = getServiceTicketModel();
    const ticket = await ServiceTicket.findByIdAndUpdate(
      req.params.ticketId,
      { paymentSlipUrl: slipUrl, slipUploadedAt: new Date(), paymentStatus: "UNDER_REVIEW" },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    await createLog({
      eventType:   "SERVICE_PAYMENT_SUBMITTED",
      paymentType: resolveServiceType(ticket) === "MAINTENANCE" ? "MAINTENANCE" : "REPAIR",
      ticketId:    ticket._id.toString(),
      customerId:  ticket.customerId,
      amount:      ticket.serviceFee || 0,
      slipUrl,
      performedBy: "Customer",
    });

    res.json({ message: "Slip uploaded", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── APPROVE payment ───────────────────────────────────────────────────────────
exports.approvePayment = async (req, res) => {
  try {
    const ServiceTicket = getServiceTicketModel();
    const User = getUserModel();

    const ticket = await ServiceTicket.findByIdAndUpdate(
      req.params.id,
      { paymentStatus: "APPROVED", approvedAt: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";
    const svcType = resolveServiceType(ticket);

    await createLog({
      eventType:    "SERVICE_PAYMENT_APPROVED",
      paymentType:  svcType === "MAINTENANCE" ? "MAINTENANCE" : "REPAIR",
      ticketId:     ticket._id.toString(),
      customerId:   ticket.customerId,
      customerName,
      customerEmail,
      amount:       ticket.serviceFee || 0,
      performedBy:  "Finance Officer",
    });

    if (customerEmail) {
      await sendServiceApprovalEmail(customerEmail, customerName, svcType);
    }

    res.json({ message: "Payment approved", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── REJECT payment ────────────────────────────────────────────────────────────
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Reason required" });

    const ServiceTicket = getServiceTicketModel();
    const User = getUserModel();

    const ticket = await ServiceTicket.findByIdAndUpdate(
      req.params.id,
      { paymentStatus: "REJECTED", rejectionReason, rejectedAt: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";
    const svcType = resolveServiceType(ticket);

    await createLog({
      eventType:      "SERVICE_PAYMENT_REJECTED",
      paymentType:    svcType === "MAINTENANCE" ? "MAINTENANCE" : "REPAIR",
      ticketId:       ticket._id.toString(),
      customerId:     ticket.customerId,
      customerName,
      customerEmail,
      amount:         ticket.serviceFee || 0,
      rejectionReason,
      performedBy:    "Finance Officer",
    });

    if (customerEmail) {
      await sendServiceRejectionEmail(customerEmail, customerName, rejectionReason, svcType);
    }

    res.json({ message: "Payment rejected", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── GET verified payments ─────────────────────────────────────────────────────
exports.getVerifiedPayments = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const ServiceTicket = getServiceTicketModel();
    const User = getUserModel();

    const query = { paymentStatus: "APPROVED" };
    if (serviceType) {
      query.$or = [
        { serviceType: { $regex: serviceType, $options: "i" } },
        { requestType: { $regex: serviceType, $options: "i" } },
        { category:    { $regex: serviceType, $options: "i" } },
      ];
    }

    const tickets = await ServiceTicket.find(query).sort({ approvedAt: -1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.serviceType = resolveServiceType(t);
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
    const { serviceType } = req.params;
    const ServiceTicket = getServiceTicketModel();
    const User = getUserModel();

    const query = { paymentStatus: "REJECTED" };
    if (serviceType) {
      query.$or = [
        { serviceType: { $regex: serviceType, $options: "i" } },
        { requestType: { $regex: serviceType, $options: "i" } },
        { category:    { $regex: serviceType, $options: "i" } },
      ];
    }

    const tickets = await ServiceTicket.find(query).sort({ rejectedAt: -1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.serviceType = resolveServiceType(t);
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