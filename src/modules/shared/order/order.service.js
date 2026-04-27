/**
 * Order Service (Shared)
 * Used by Customer, CSA, Manager roles
 */
const Order = require("../../../models/Order");
const configCache = require("../../../utils/config-cache");

exports.getUserOrders = async (userId, filters = {}, pagination = {}) => {
  try {
    const { limit = 10, skip = 0 } = pagination;
    const query = { customer: userId, ...filters };

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
    const order = await Order.findOne({ _id: orderId, customer: userId });
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
    const order = await Order.findOne({ _id: orderId, customer: userId });
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

/**
 * Check if order amount requires quotation approval
 * @param {number} amount - Order amount
 * @returns {Promise<boolean>}
 */
exports.checkQuotationApprovalRequired = async (amount) => {
  try {
    const rules = await configCache.getBusinessRules();
    return amount > rules.quotationApprovalThreshold;
  } catch (err) {
    console.error('Error checking quotation approval:', err);
    return false;
  }
};

/**
 * Create new order with business rules applied
 * @param {Object} orderData - Order creation data
 * @param {string} customerId - Customer ID
 * @returns {Promise<Order>}
 */
exports.createOrder = async (orderData, customerId) => {
  try {
    const { amount } = orderData;

    // Check if quotation approval is required
    const needsApproval = await exports.checkQuotationApprovalRequired(amount);

    const orderStatus = needsApproval ? 'Awaiting Approval' : 'Order Placed';

    const order = await Order.create({
      ...orderData,
      customer: customerId,
      orderStatus,
      status: needsApproval ? 'Pending' : 'Completed',
    });

    return order;
  } catch (err) {
    throw new Error(`Failed to create order: ${err.message}`);
  }
};

/**
 * Apply default warranty to delivered order
 * @param {string} orderId - Order ID
 * @returns {Promise<Order>}
 */
exports.applyDefaultWarranty = async (orderId) => {
  try {
    const rules = await configCache.getBusinessRules();
    const warrantyMonths = rules.defaultWarrantyMonths;

    const today = new Date();
    const warrantyExpiry = new Date(today);
    warrantyExpiry.setMonth(warrantyExpiry.getMonth() + warrantyMonths);

    const updated = await Order.findByIdAndUpdate(
      orderId,
      {
        warrantyStart: today,
        warrantyExpiry,
      },
      { new: true }
    );

    return updated;
  } catch (err) {
    throw new Error(`Failed to apply warranty: ${err.message}`);
  }
};

/**
 * Check if warranty is still active for an order
 * @param {string} orderId - Order ID
 * @returns {Promise<boolean>}
 */
exports.isWarrantyActive = async (orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order || !order.warrantyExpiry) {
      return false;
    }

    return new Date() <= new Date(order.warrantyExpiry);
  } catch (err) {
    console.error('Error checking warranty status:', err);
    return false;
  }
};
