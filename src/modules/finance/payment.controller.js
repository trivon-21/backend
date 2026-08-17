const mongoose = require("mongoose");
const OrderModel = require("../../models/Order");
const { sendBuyOnlyRejectionEmail, sendBuyOnlyApprovalEmail } = require("../shared/notification/email.service");
const { createLog } = require("./auditLog.controller");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

const getOrderModel = () => OrderModel;

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

const resolveCustomer = async (order) => {
  const User = getUserModel();
  // Team DB uses 'userId', legacy app uses 'customer'
  const customerId = order?.userId || order?.customer;

  if (!customerId) {
    // Fallback to shipping details (team DB)
    const fallbackName = order?.shippingDetails?.firstName || order?.shippingDetails?.lastName
      ? `${order?.shippingDetails?.firstName || ""} ${order?.shippingDetails?.lastName || ""}`.trim()
      : order?.customerName || "Unknown";
    return {
      customerName: fallbackName,
      customerEmail: order?.shippingDetails?.email || order?.customerEmail || "",
    };
  }

  const user = await User.findById(customerId).catch(() => null);
  if (user) {
    return {
      customerName: `${user.fullName || ""} ${user.lastName || ""}`.trim() || "Unknown",
      customerEmail: user.email || "",
    };
  }

  // Fallback to shipping details if user not found
  const fallbackName = order?.shippingDetails?.firstName || order?.shippingDetails?.lastName
    ? `${order?.shippingDetails?.firstName || ""} ${order?.shippingDetails?.lastName || ""}`.trim()
    : order?.customerName || "Unknown";
  return {
    customerName: fallbackName,
    customerEmail: order?.shippingDetails?.email || order?.customerEmail || "",
  };
};

// Helper: format an Order doc into payment shape
const formatOrder = async (order) => {
  const { customerName, customerEmail } = await resolveCustomer(order);
  const itemsTotal = Array.isArray(order?.items)
    ? order.items.reduce((sum, item) => {
        const price = Number(item?.price ?? item?.unitPrice ?? 0);
        const quantity = Number(item?.quantity ?? 1);
        return sum + (price * quantity);
      }, 0)
    : 0;

  const derivedAmount = Number(order?.total ?? order?.subtotal ?? order?.amount ?? itemsTotal ?? 0) || 0;

  // Team DB uses 'status' field: "Pending Payment"/"Pending" → "PENDING", "Payment Confirmed" → "APPROVED"
  const statusMap = {
    "Pending Payment":     "PENDING",
    "Pending":             "PENDING",
    "Under Review (Finance)": "PENDING",
    "Payment Confirmed":   "APPROVED",
    "Confirmed":           "APPROVED",
    "Rejected":            "REJECTED",
    "Cancelled":           "REJECTED"
  };

  // paymentStatus can also indicate the true state if status is ambiguous
  let resolvedStatus = statusMap[order.status] || "PENDING";
  if (order.paymentStatus === "Rejected") resolvedStatus = "REJECTED";
  if (order.paymentStatus === "Approved" || order.paymentStatus === "Confirmed") resolvedStatus = "APPROVED";

  return {
    _id: order._id,
    orderId: order.orderReference || order.orderRef || order.orderId || order._id.toString(),
    itemName: order.itemName || order.items?.[0]?.name || order.items?.[0]?.itemName || "",
    customerName,
    customerEmail,
    amount: derivedAmount,
    slipUrl: order.paymentSlipUrl || order.paymentSlip || null,
    paymentType: "BUY_ONLY",
    status: resolvedStatus,
    rejectionReason: order.rejectionReason || null,
    updatedAt: order.updatedAt,
    createdAt: order.createdAt,
  };
};

// GET pending — orders with status "Pending Payment" (team DB field name)
exports.getPendingPayments = async (req, res) => {
  try {
    const Order = getOrderModel();
    const orders = await Order.find({
      $and: [
        {
          $or: [
            { "items.purchaseType": "buy_only" },
            { "items.purchaseType": "buy_and_install" }
          ]
        },
        {
          $or: [
            { status: "Pending Payment" },
            { status: "Pending" },
            { status: "Under Review (Finance)" },
            { paymentStatus: "Under Review" }
          ]
        }
      ]
    }).sort({ createdAt: 1 });

    const formatted = await Promise.all(orders.map(formatOrder));
    res.json(formatted);
  } catch (error) {
    console.error("getPendingPayments error:", error);
    res.status(500).json({ message: "Failed to fetch pending payments", error: error.message });
  }
};

// APPROVE — set status to Payment Confirmed (team DB field)
exports.approvePayment = async (req, res) => {
  try {
    const Order = getOrderModel();
    const orderId = req.params.id;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        status: "Payment Confirmed",
        paymentStatus: "Approved",   // keep both fields in sync
        rejectionReason: null,
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    console.log("Order approved - ID:", updatedOrder._id, "status:", updatedOrder.status);

    const User = getUserModel();
    const user = await User.findById(updatedOrder.userId || updatedOrder.customer);

    const customerName = user?.fullName
      ? `${user.fullName} ${user.lastName || ""}`.trim()
      : `${updatedOrder.shippingDetails?.firstName || ""} ${updatedOrder.shippingDetails?.lastName || ""}`.trim() || "Unknown";
    const customerEmail = user?.email || updatedOrder.shippingDetails?.email || "";
    const orderRef = updatedOrder.orderReference || updatedOrder.orderRef || updatedOrder._id.toString();
    const amount = updatedOrder.total || updatedOrder.subtotal || updatedOrder.amount
      || (updatedOrder.items?.[0]?.price * (updatedOrder.items?.[0]?.quantity || 1)) || 0;

    await createLog({
      eventType:     "PAYMENT_APPROVED",
      paymentType:   "BUY_ONLY",
      orderId:       orderRef,
      customerId:    updatedOrder.userId || updatedOrder.customer,
      customerName,
      customerEmail,
      amount,
      slipUrl:       updatedOrder.paymentSlipUrl || updatedOrder.paymentSlip || null,
      performedBy:   "Finance Officer",
    });

    if (customerEmail) {
      await sendBuyOnlyApprovalEmail(customerEmail, customerName, orderRef);
    }

    const formatted = await formatOrder(updatedOrder);
    res.json({ message: "Payment approved and email sent", payment: formatted });
  } catch (error) {
    console.error("approvePayment error:", error);
    res.status(500).json({ message: "Approval failed", error: error.message });
  }
};

// REJECT — set status to Rejected + send email with checkout link
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Rejection reason required" });

    const Order = getOrderModel();
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = "Cancelled";        // consistent with approve using "status" field
    order.paymentStatus = "Rejected";  // keep both in sync
    order.rejectionReason = rejectionReason;
    const updatedOrder = await order.save();

    const User = getUserModel();
    const user = await User.findById(order.userId || order.customer);

    const customerName = user?.fullName
      ? `${user.fullName} ${user.lastName || ""}`.trim()
      : `${order.shippingDetails?.firstName || ""} ${order.shippingDetails?.lastName || ""}`.trim() || "Unknown";
    const customerEmail = user?.email || order.shippingDetails?.email || "";
    const orderRef = order.orderReference || order.orderRef || order._id.toString();
    const amount = order.total || order.subtotal || order.amount
      || (order.items?.[0]?.price * (order.items?.[0]?.quantity || 1)) || 0;

    await createLog({
      eventType:      "PAYMENT_REJECTED",
      paymentType:    "BUY_ONLY",
      orderId:        orderRef,
      customerId:     order.userId || order.customer,
      customerName,
      customerEmail,
      amount,
      slipUrl:        order.paymentSlipUrl || order.paymentSlip || null,
      rejectionReason,
      performedBy:    "Finance Officer",
    });
    console.log("Order rejected:", updatedOrder._id, "Reason:", updatedOrder.rejectionReason);

    // Checkout/reupload link — same page used for original slip upload
    const reuploadLink = `${FRONTEND_URL}/checkout?orderId=${order._id}`;

    if (customerEmail) {
      await sendBuyOnlyRejectionEmail(
        customerEmail,
        customerName,
        orderRef,
        order.itemName || order.items?.[0]?.name || "",
        rejectionReason,
        reuploadLink
      );
    }

    const formatted = await formatOrder(updatedOrder);
    res.json({ message: "Payment rejected and email sent", payment: formatted });
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
      $and: [
        {
          $or: [
            { "items.purchaseType": "buy_only" },
            { "items.purchaseType": "buy_and_install" }
          ]
        },
        {
          $or: [
            { status: "Payment Confirmed" },
            { status: "Confirmed" },
            { paymentStatus: "Approved" },
            { paymentStatus: "Confirmed" },
          ]
        }
      ]
    }).sort({ createdAt: -1 });

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
      $and: [
        {
          $or: [
            { "items.purchaseType": "buy_only" },
            { "items.purchaseType": "buy_and_install" }
          ]
        },
        {
          $or: [
            { status: "Cancelled" },
            { status: "Rejected" },
            { paymentStatus: "Rejected" },
          ]
        }
      ]
    }).sort({ createdAt: -1 });

    const formatted = await Promise.all(orders.map(formatOrder));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rejected payments", error: error.message });
  }
};