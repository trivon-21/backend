const mongoose = require("mongoose");
const { sendBuyOnlyRejectionEmail, sendBuyOnlyApprovalEmail } = require("../services/email.service");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

// Lazy-load Order model (created by another team)
const getOrderModel = () => {
  try { return mongoose.model("Order"); }
  catch {
    const s = new mongoose.Schema({
      orderRef: String,
      customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      itemName: String, quantity: Number, amount: Number,
      orderType: String, paymentStatus: String,
      paymentSlipUrl: String, status: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("Order", s);
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String,
      email: String, phoneNumber: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s);
  }
};

// Helper: format an Order doc into payment shape
const formatOrder = async (order) => {
  const User = getUserModel();
  const user = await User.findById(order.customer);
  return {
    _id:             order._id,
    orderId:         order.orderRef || order._id.toString(),
    itemName:        order.itemName || "",
    customerName:    user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Unknown",
    customerEmail:   user?.email || "",
    amount:          order.amount || 0,
    slipUrl:         order.paymentSlipUrl || null,
    paymentType:     "BUY_ONLY",
    status:          order.paymentStatus === "Under Review" ? "PENDING"
                   : order.paymentStatus === "Approved"     ? "APPROVED"
                   : order.paymentStatus === "Rejected"     ? "REJECTED"
                   : "PENDING",
    rejectionReason: order.rejectionReason || null,
    updatedAt:       order.updatedAt,
    createdAt:       order.createdAt,
  };
};

// GET pending — orders with paymentStatus "Under Review" and orderType "Buy Only"
exports.getPendingPayments = async (req, res) => {
  try {
    const Order = getOrderModel();
    const orders = await Order.find({
      orderType: "Buy Only",
      paymentStatus: "Under Review",
    }).sort({ updatedAt: -1 });

    const formatted = await Promise.all(orders.map(formatOrder));
    res.json(formatted);
  } catch (error) {
    console.error("getPendingPayments error:", error);
    res.status(500).json({ message: "Failed to fetch pending payments", error: error.message });
  }
};

// APPROVE — set paymentStatus to Approved + send email
exports.approvePayment = async (req, res) => {
  try {
    const Order = getOrderModel();
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.paymentStatus = "Approved";
    order.rejectionReason = null;
    await order.save();

    const User = getUserModel();
    const user = await User.findById(order.customer);
    if (user?.email) {
      await sendBuyOnlyApprovalEmail(
        user.email,
        user.fullName || "Customer",
        order.orderRef || order._id.toString()
      );
    }

    res.json({ message: "Payment approved and email sent" });
  } catch (error) {
    console.error("approvePayment error:", error);
    res.status(500).json({ message: "Approval failed", error: error.message });
  }
};

// REJECT — set paymentStatus to Rejected + send email with checkout link
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Rejection reason required" });

    const Order = getOrderModel();
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.paymentStatus = "Rejected";
    order.rejectionReason = rejectionReason;
    await order.save();

    const User = getUserModel();
    const user = await User.findById(order.customer);

    // Checkout/reupload link — same page used for original slip upload
    const reuploadLink = `${FRONTEND_URL}/checkout?orderId=${order._id}`;

    if (user?.email) {
      await sendBuyOnlyRejectionEmail(
        user.email,
        user.fullName || "Customer",
        order.orderRef || order._id.toString(),
        order.itemName || "",
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

// GET approved payments
exports.getApprovedPayments = async (req, res) => {
  try {
    const Order = getOrderModel();
    const orders = await Order.find({
      orderType: "Buy Only",
      paymentStatus: "Approved",
    }).sort({ updatedAt: -1 });

    const formatted = await Promise.all(orders.map(formatOrder));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch approved payments", error: error.message });
  }
};

// GET rejected payments
exports.getRejectedPayments = async (req, res) => {
  try {
    const Order = getOrderModel();
    const orders = await Order.find({
      orderType: "Buy Only",
      paymentStatus: "Rejected",
    }).sort({ updatedAt: -1 });

    const formatted = await Promise.all(orders.map(formatOrder));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rejected payments", error: error.message });
  }
};