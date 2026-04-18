/**
 * Order Service (Shared)
 * Used by Customer, CSA, Manager, Super-Admin roles
 */
const Order = require("../../../models/Order");

exports.getUserOrders = async (userId, filters = {}, pagination = {}) => {
  try {
    const { limit = 10, skip = 0 } = pagination;
    const query = { customerId: userId, ...filters };

    const orders = await Order.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Order.countDocuments(query);

    return { orders, total, limit, skip };
  } catch (err) {
    throw new Error(`Failed to fetch user orders: ${err.message}`);
  }
};

exports.getOrderById = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    return order;
  } catch (err) {
    throw new Error(`Failed to fetch order: ${err.message}`);
  }
};

exports.trackOrderPublic = async (orderRef, phone, email) => {
  try {
    const query = { orderRef };

    // Optional phone or email verification
    if (phone || email) {
      query.$or = [];
      if (phone) query.$or.push({ "customer.phoneNumber": phone });
      if (email) query.$or.push({ "customer.email": email });
    }

    const order = await Order.findOne(query);
    if (!order) throw new Error("Order not found");

    return {
      orderRef: order.orderRef,
      customer: order.customer,
      product: order.product,
      orderStatus: order.orderStatus,
      trackingId: order.trackingId,
      partnerUrl: order.partnerUrl,
      deliveryDate: order.deliveryDate
    };
  } catch (err) {
    throw new Error(`Failed to track order: ${err.message}`);
  }
};

exports.cancelOrder = async (orderId, userId) => {
  try {
    const order = await Order.findOne({ _id: orderId, customerId: userId });
    if (!order) throw new Error("Order not found or unauthorized");

    // Only allow cancellation for specific statuses
    const cancellableStatuses = ['Order Placed', 'Payment Uploaded'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      throw new Error(`Cannot cancel order with status: ${order.orderStatus}`);
    }

    const updated = await Order.findByIdAndUpdate(
      orderId,
      { orderStatus: 'Cancelled', status: 'Returned' },
      { new: true }
    );

    return updated;
  } catch (err) {
    throw new Error(`Failed to cancel order: ${err.message}`);
  }
};

exports.reuploadPayment = async (orderId, userId, paymentSlipUrl) => {
  try {
    const order = await Order.findOne({ _id: orderId, customerId: userId });
    if (!order) throw new Error("Order not found or unauthorized");

    const updated = await Order.findByIdAndUpdate(
      orderId,
      { paymentSlipUrl, paymentStatus: 'Pending', orderStatus: 'Payment Uploaded' },
      { new: true }
    );

    return updated;
  } catch (err) {
    throw new Error(`Failed to reupload payment: ${err.message}`);
  }
};

exports.getAllOrders = async (filters = {}, pagination = {}) => {
  try {
    const { limit = 50, skip = 0 } = pagination;

    const orders = await Order.find(filters)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Order.countDocuments(filters);

    return { orders, total, limit, skip };
  } catch (err) {
    throw new Error(`Failed to fetch orders: ${err.message}`);
  }
};
