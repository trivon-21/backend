const orderService = require("../../shared/order/order.service");

exports.getOrders = async (req, res) => {
  try {
    const result = await orderService.getUserOrders(req.user._id);
    return res.json(result.orders);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    // Verify ownership
    if (order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    return res.json(order);
  } catch (err) {
    return res.status(err.message.includes("not found") ? 404 : 500).json({ message: err.message });
  }
};

exports.trackOrder = async (req, res) => {
  try {
    const { ref, phone, email } = req.query;
    if (!ref) return res.status(400).json({ message: "Order reference number is required" });

    const order = await orderService.trackOrderPublic(ref.trim().toUpperCase(), phone, email);
    return res.json(order);
  } catch (err) {
    return res.status(err.message.includes("not found") ? 404 : 500).json({ message: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await orderService.cancelOrder(req.params.id, req.user._id);
    return res.json({ message: "Order cancelled successfully", order });
  } catch (err) {
    return res.status(err.message.includes("not found") ? 404 : 400).json({ message: err.message });
  }
};

exports.reuploadPayment = async (req, res) => {
  try {
    const { paymentSlipUrl } = req.body;
    if (!paymentSlipUrl) return res.status(400).json({ message: "Payment slip URL required" });

    const order = await orderService.reuploadPayment(req.params.id, req.user._id, paymentSlipUrl);
    return res.json({ message: "Payment slip re-uploaded successfully", order });
  } catch (err) {
    return res.status(err.message.includes("not found") ? 404 : 400).json({ message: err.message });
  }
};
