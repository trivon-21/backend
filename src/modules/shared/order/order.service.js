/**
 * Order Service (Shared)
 * Used by Customer, CSA, Manager roles
 */
const Order = require("../../../models/Order");
const InstallationOrder = require("../../../models/installationOrder.model");
const configCache = require("../../../utils/config-cache");

const orderReferenceFilter = (reference) => ({
  $or: [
    { orderRef: reference },
    { orderReference: reference },
    { orderId: reference },
  ],
});

const installationReferenceFilter = (reference) => ({
  $or: [
    { orderReference: reference },
    { orderId: reference },
  ],
});

const installationOwnerFilter = (userId) => ({ userId: String(userId) });

const normalizeOrderForCustomer = (order, isInstallationOrder = false) => {
  const firstItem = order.items?.[0] || {};
  const orderType = isInstallationOrder ? 'Buy & Install' : (order.orderType || 'Buy Only');
  const orderStatus = isInstallationOrder
    ? (order.status === 'Confirmed' ? 'Payment Confirmed' : order.status)
    : order.orderStatus;

  return {
    id: order._id,
    orderRef: order.orderRef || order.orderReference || order.orderId,
    itemName: order.itemName || firstItem.name || '',
    productImage: order.productImage || '',
    quantity: order.quantity || firstItem.quantity || 1,
    amount: order.amount ?? order.total ?? order.subtotal ?? 0,
    status: isInstallationOrder
      ? (order.status === 'Cancelled' ? 'Returned' : order.status === 'Confirmed' ? 'Completed' : 'Pending')
      : order.status,
    paymentStatus: isInstallationOrder
      ? (order.paymentStatus === 'Pending' ? 'Pending Payment' : order.paymentStatus)
      : order.paymentStatus,
    orderType,
    orderStatus,
    deliveryTrackingId: order.deliveryTrackingId || order.trackingId || '',
    deliveryPartnerUrl: order.deliveryPartnerUrl || order.partnerUrl || '',
    warrantyStart: order.warrantyStart || null,
    warrantyExpiry: order.warrantyExpiry || null,
    amcStatus: order.amcStatus || 'Not Available',
    paymentSlipUrl: order.paymentSlipUrl || order.paymentSlip || '',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

exports.getUserOrders = async (userId, filters = {}, pagination = {}) => {
  try {
    const { limit = null, skip = 0 } = pagination;
    const query = { customer: userId, ...filters };
    const [canonicalOrders, installationOrders] = await Promise.all([
      Order.find(query),
      Object.keys(filters).length === 0
        ? InstallationOrder.find(installationOwnerFilter(userId))
        : [],
    ]);
    const combinedOrders = [
      ...canonicalOrders.map((order) => normalizeOrderForCustomer(order)),
      ...installationOrders.map((order) => normalizeOrderForCustomer(order, true)),
    ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const orders = limit === null
      ? combinedOrders.slice(skip)
      : combinedOrders.slice(skip, skip + limit);
    const total = combinedOrders.length;

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
    const normalizedRef = String(orderRef || '').trim();
    const query = orderReferenceFilter(normalizedRef);

    // Optional phone or email verification
    if (phone || email) {
      const verificationClauses = [];
      if (phone) verificationClauses.push({ "shippingDetails.phone": String(phone).trim() });
      if (email) verificationClauses.push({ "shippingDetails.email": String(email).trim().toLowerCase() });
      query.$and = [{ $or: query.$or }, { $or: verificationClauses }];
      delete query.$or;
    }

    const [order, installationOrder] = await Promise.all([
      Order.findOne(query),
      InstallationOrder.findOne({
        ...installationReferenceFilter(normalizedRef),
        ...(query.$and ? { $and: query.$and.slice(1) } : {}),
      }),
    ]);
    if (order) return normalizeOrderForCustomer(order);
    if (installationOrder) return normalizeOrderForCustomer(installationOrder, true);
    throw new Error("Order not found");
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
      { new: true, runValidators: true }
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
      { paymentSlipUrl, paymentSlip: paymentSlipUrl, paymentStatus: 'Pending', orderStatus: 'Payment Uploaded' },
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
    return amount > (rules?.quotationApprovalThreshold ?? 1000000);
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
      userId: String(customerId),
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
