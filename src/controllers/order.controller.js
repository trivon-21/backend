const Order = require("../models/Order");

// GET /api/orders - list all orders for the authenticated user
exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 });
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/orders/track - track by ref + optional phone/email (public)
exports.trackOrder = async (req, res) => {
  try {
    const { ref, phone, email } = req.query;
    if (!ref) return res.status(400).json({ message: "Order reference number is required" });

    const order = await Order.findOne({ orderRef: ref.trim().toUpperCase() }).populate(
      "customer",
      "fullName email phoneNumber"
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Optional verification by phone or email
    if (phone || email) {
      const custPhone = order.customer?.phoneNumber || "";
      const custEmail = order.customer?.email || "";
      const match =
        (phone && custPhone && custPhone === phone.trim()) ||
        (email && custEmail && custEmail.toLowerCase() === email.trim().toLowerCase());
      if (!match) {
        return res.status(403).json({ message: "Verification failed. Phone or email does not match." });
      }
    }

    return res.json(formatOrder(order));
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/orders/:id - single order detail
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) return res.status(404).json({ message: "Order not found" });
    return res.json(formatOrder(order));
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/orders/:id/cancel
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    const nonCancellable = ["Shipped", "Delivered", "Installation Scheduled", "Installation Completed"];
    if (nonCancellable.includes(order.orderStatus)) {
      return res.status(400).json({ message: "Order cannot be cancelled at this stage" });
    }

    order.status = "Returned";
    order.orderStatus = "Order Placed";
    await order.save();
    return res.json({ message: "Order cancelled successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/orders/:id/reupload-payment
exports.reuploadPayment = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.paymentStatus !== "Rejected") {
      return res.status(400).json({ message: "Payment re-upload is only allowed when payment was rejected" });
    }

    const { paymentSlipUrl } = req.body;
    order.paymentSlipUrl = paymentSlipUrl || "";
    order.paymentStatus = "Under Review";
    order.orderStatus = "Payment Uploaded";
    await order.save();
    return res.json({ message: "Payment slip re-uploaded successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

function formatOrder(o) {
  return {
    id: o._id,
    orderRef: o.orderRef,
    itemName: o.itemName,
    productImage: o.productImage,
    quantity: o.quantity,
    amount: o.amount,
    status: o.status,
    paymentStatus: o.paymentStatus,
    orderType: o.orderType,
    orderStatus: o.orderStatus,
    deliveryTrackingId: o.deliveryTrackingId,
    deliveryPartnerUrl: o.deliveryPartnerUrl,
    warrantyStart: o.warrantyStart,
    warrantyExpiry: o.warrantyExpiry,
    amcStatus: o.amcStatus,
    paymentSlipUrl: o.paymentSlipUrl,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
}
