const mongoose      = require("mongoose");
const ServiceTicket = require("../shared/ticket/ServiceTicket.model");
const { sendServiceRejectionEmail, sendServiceApprovalEmail } = require("../shared/notification/email.service");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String, email: String, phoneNumber: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s);
  }
};

const getOrderModel = () => {
  try { return mongoose.model("Order"); }
  catch {
    const s = new mongoose.Schema({ orderRef: String, itemName: String }, { strict: false });
    return mongoose.model("Order", s);
  }
};

const formatTicket = async (t) => {
  const User  = getUserModel();
  const Order = getOrderModel();
  const user  = await User.findById(t.customerId);
  const order = t.orderId ? await Order.findById(t.orderId) : null;
  
  // Fallback: if user not found, try to get customer name from order
  let customerName = "Unknown";
  let customerEmail = "";
  
  if (user) {
    customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim() || "Unknown";
    customerEmail = user.email || "";
  } else if (order?.customerName) {
    customerName = order.customerName;
    customerEmail = order.customerEmail || "";
  }
  
  return {
    _id:             t._id,
    orderId:         order?.orderRef || (t.orderId?.toString() || "-"),
    ticketId:        `SVC-${t._id.toString().slice(-6).toUpperCase()}`,
    customerName:    customerName,
    customerEmail:   customerEmail,
    serviceType:     t.serviceType,
    description:     t.description || "",
    amount:          t.serviceFee || 0,
    slipUrl:         t.paymentSlipUrl || null,
    paymentStatus:   t.paymentStatus,
    rejectionReason: t.rejectionReason || null,
    slipUploadedAt:  t.slipUploadedAt,
    approvedAt:      t.approvedAt,
    rejectedAt:      t.rejectedAt,
    updatedAt:       t.updatedAt,
    createdAt:       t.createdAt,
  };
};

// GET pending verification — serviceType = REPAIR or MAINTENANCE
exports.getPendingVerification = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const tickets = await ServiceTicket.find({
      serviceType:   serviceType.toUpperCase(),
      paymentStatus: "UNDER_REVIEW",
    }).sort({ slipUploadedAt: -1 });

    const formatted = await Promise.all(tickets.map(formatTicket));
    res.json(formatted);
  } catch (error) {
    console.error("getPendingVerification error:", error);
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// APPROVE
exports.approvePayment = async (req, res) => {
  try {
    const ticket = await ServiceTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.paymentStatus = "APPROVED";
    ticket.approvedAt    = new Date();
    ticket.rejectionReason = null;
    await ticket.save();

    const User  = getUserModel();
    const Order = getOrderModel();
    const user  = await User.findById(ticket.customerId);
    const order = ticket.orderId ? await Order.findById(ticket.orderId) : null;

    if (user?.email) {
      await sendServiceApprovalEmail(
        user.email,
        user.fullName || "Customer",
        order?.orderRef || ticket._id.toString(),
        ticket.serviceType
      );
    }

    res.json({ message: "Payment approved and email sent" });
  } catch (error) {
    console.error("approvePayment error:", error);
    res.status(500).json({ message: "Approval failed", error: error.message });
  }
};

// REJECT
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Rejection reason required" });

    const ticket = await ServiceTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.paymentStatus   = "REJECTED";
    ticket.rejectionReason = rejectionReason;
    ticket.rejectedAt      = new Date();
    await ticket.save();

    const User  = getUserModel();
    const Order = getOrderModel();
    const user  = await User.findById(ticket.customerId);
    const order = ticket.orderId ? await Order.findById(ticket.orderId) : null;

    // Reupload link — same page used for original slip upload
    const reuploadLink = `${FRONTEND_URL}/service-payment?ticketId=${ticket._id}`;

    if (user?.email) {
      await sendServiceRejectionEmail(
        user.email,
        user.fullName || "Customer",
        order?.orderRef || ticket._id.toString(),
        ticket.serviceType,
        rejectionReason,
        reuploadLink
      );
    }

    res.json({ message: "Payment rejected and email sent" });
  } catch (error) {
    console.error("rejectPayment error:", error);
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};

// GET verified
exports.getVerifiedPayments = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const tickets = await ServiceTicket.find({
      serviceType:   serviceType.toUpperCase(),
      paymentStatus: "APPROVED",
    }).sort({ approvedAt: -1 });

    const formatted = await Promise.all(tickets.map(formatTicket));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// GET rejected
exports.getRejectedPayments = async (req, res) => {
  try {
    const { serviceType } = req.params;
    const tickets = await ServiceTicket.find({
      serviceType:   serviceType.toUpperCase(),
      paymentStatus: "REJECTED",
    }).sort({ rejectedAt: -1 });

    const formatted = await Promise.all(tickets.map(formatTicket));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};