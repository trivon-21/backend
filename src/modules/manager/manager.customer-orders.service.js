'use strict';

const mongoose = require('mongoose');
const Order = require('../../models/Order');
const InstallationOrder = require('../../models/installationOrder.model');
const ServiceRequest = require('../../models/ServiceRequest');
const User = require('../../models/User');

/**
 * Normalizes lookup query string for case-insensitive exact or regex matching.
 */
function buildRefQuery(field, ref) {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { [field]: { $regex: new RegExp(`^${escaped}$`, 'i') } };
}

/**
 * Lookup past order or service request by reference or ID.
 * Supports Order (orderRef, orderReference, orderId, _id),
 * InstallationOrder (orderReference, orderId, _id),
 * and ServiceRequest (serviceRequestRef, _id).
 */
exports.lookupOrder = async (rawRef) => {
  const ref = String(rawRef || '').trim();
  if (!ref) {
    const error = new Error('Order reference or ID is required');
    error.statusCode = 400;
    throw error;
  }

  const isObjectId = mongoose.Types.ObjectId.isValid(ref);

  // 1. Check canonical Product Order
  const orderConditions = [
    buildRefQuery('orderRef', ref),
    buildRefQuery('orderReference', ref),
    buildRefQuery('orderId', ref),
  ];
  if (isObjectId) {
    orderConditions.push({ _id: new mongoose.Types.ObjectId(ref) });
  }

  const productOrder = await Order.findOne({ $or: orderConditions })
    .populate('customer', 'fullName lastName email phoneNumber address gender')
    .lean();

  if (productOrder) {
    const customer = productOrder.customer || {};
    const shipping = productOrder.shippingDetails || {};

    const items = Array.isArray(productOrder.items) && productOrder.items.length > 0
      ? productOrder.items.map((item) => {
          const price = Number(item.price || item.unitPrice || 0);
          const quantity = Number(item.quantity || 1);
          return {
            name: item.name || item.itemName || productOrder.itemName || 'Product',
            price,
            quantity,
            purchaseType: item.purchaseType || 'buy_only',
            total: price * quantity,
          };
        })
      : productOrder.itemName
      ? [{
          name: productOrder.itemName,
          price: Number(productOrder.amount || productOrder.total || 0),
          quantity: Number(productOrder.quantity || 1),
          purchaseType: 'buy_only',
          total: Number(productOrder.amount || productOrder.total || 0),
        }]
      : [];

    const computedTotal = items.reduce((sum, item) => sum + item.total, 0);
    const subtotal = Number(productOrder.subtotal ?? (computedTotal || productOrder.amount || 0));
    const additionalCharges = Number(productOrder.additionalCharges || 0);
    const total = Number(productOrder.total ?? (subtotal + additionalCharges));

    return {
      success: true,
      data: {
        id: String(productOrder._id),
        category: 'Product Order',
        reference: productOrder.orderRef || productOrder.orderReference || productOrder.orderId || `ORD-${String(productOrder._id).slice(-6).toUpperCase()}`,
        orderType: productOrder.orderType || (items.some((i) => i.purchaseType === 'buy_and_install') ? 'Buy & Install' : 'Buy Only'),
        status: productOrder.status || 'Pending',
        paymentStatus: productOrder.paymentStatus || 'Pending Payment',
        orderStatus: productOrder.orderStatus || 'Order Placed',
        customer: {
          id: customer._id ? String(customer._id) : String(productOrder.userId || ''),
          fullName: customer.fullName || [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || 'Customer',
          lastName: customer.lastName || shipping.lastName || '',
          email: customer.email || shipping.email || '',
          phoneNumber: customer.phoneNumber || shipping.phone || '',
          address: customer.address || shipping.address || '',
          city: shipping.city || '',
          postalCode: shipping.postalCode || '',
        },
        shippingDetails: shipping,
        items,
        subtotal,
        additionalCharges,
        total,
        paymentSlip: productOrder.paymentSlipUrl || productOrder.paymentSlip || '',
        deliveryTrackingId: productOrder.deliveryTrackingId || '',
        deliveryPartnerUrl: productOrder.deliveryPartnerUrl || '',
        createdAt: productOrder.createdAt,
        updatedAt: productOrder.updatedAt,
      },
    };
  }

  // 2. Check Installation Order
  const installConditions = [
    buildRefQuery('orderReference', ref),
    buildRefQuery('orderId', ref),
  ];
  if (isObjectId) {
    installConditions.push({ _id: new mongoose.Types.ObjectId(ref) });
  }

  const installOrder = await InstallationOrder.findOne({ $or: installConditions }).lean();

  if (installOrder) {
    let customer = {};
    if (installOrder.userId && mongoose.Types.ObjectId.isValid(installOrder.userId)) {
      customer = (await User.findById(installOrder.userId).select('fullName lastName email phoneNumber address').lean()) || {};
    }

    const shipping = installOrder.shippingDetails || {};
    const items = Array.isArray(installOrder.items)
      ? installOrder.items.map((item) => {
          const price = Number(item.price || 0);
          const quantity = Number(item.quantity || 1);
          return {
            name: item.name || 'AC Unit & Installation',
            price,
            quantity,
            purchaseType: item.purchaseType || 'buy_and_install',
            total: price * quantity,
          };
        })
      : [];

    return {
      success: true,
      data: {
        id: String(installOrder._id),
        category: 'Installation Order',
        reference: installOrder.orderReference || installOrder.orderId || `INST-ORD-${String(installOrder._id).slice(-6).toUpperCase()}`,
        orderType: 'Buy & Install',
        status: installOrder.status || 'Pending Review',
        paymentStatus: installOrder.paymentStatus || 'Pending',
        orderStatus: installOrder.status || 'Pending Review',
        customer: {
          id: customer._id ? String(customer._id) : String(installOrder.userId || ''),
          fullName: customer.fullName || [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || 'Customer',
          lastName: customer.lastName || shipping.lastName || '',
          email: customer.email || shipping.email || '',
          phoneNumber: customer.phoneNumber || shipping.phone || '',
          address: customer.address || shipping.address || '',
          city: shipping.city || '',
          postalCode: shipping.postalCode || '',
        },
        shippingDetails: shipping,
        items,
        subtotal: Number(installOrder.subtotal || 0),
        additionalCharges: Number(installOrder.additionalCharges || installOrder.inspectionFee || 0),
        total: Number(installOrder.total || 0),
        paymentSlip: installOrder.paymentSlipUrl || installOrder.paymentSlip || '',
        createdAt: installOrder.createdAt,
        updatedAt: installOrder.updatedAt,
      },
    };
  }

  // 3. Check Service Request (e.g. SRQ-1008)
  const serviceConditions = [
    buildRefQuery('serviceRequestRef', ref),
  ];
  if (isObjectId) {
    serviceConditions.push({ _id: new mongoose.Types.ObjectId(ref) });
  }

  const serviceReq = await ServiceRequest.findOne({ $or: serviceConditions })
    .populate('customerId', 'fullName lastName email phoneNumber address')
    .lean();

  if (serviceReq) {
    const customer = serviceReq.customerId || {};
    return {
      success: true,
      data: {
        id: String(serviceReq._id),
        category: 'Service Request',
        reference: serviceReq.serviceRequestRef || `SRQ-${String(serviceReq._id).slice(-6).toUpperCase()}`,
        orderType: serviceReq.serviceType || 'Repair',
        status: serviceReq.status || 'New',
        paymentStatus: serviceReq.paymentRequired ? 'Payment Required' : 'Included / Standard',
        orderStatus: serviceReq.status || 'New',
        customer: {
          id: customer._id ? String(customer._id) : '',
          fullName: customer.fullName || 'Customer',
          lastName: customer.lastName || '',
          email: customer.email || '',
          phoneNumber: customer.phoneNumber || '',
          address: customer.address || '',
          city: '',
          postalCode: '',
        },
        shippingDetails: {
          address: customer.address || '',
          phone: customer.phoneNumber || '',
          email: customer.email || '',
        },
        items: [],
        serviceDetails: {
          serviceType: serviceReq.serviceType,
          acUnitModel: serviceReq.acUnitModel || 'N/A',
          acUnitSerial: serviceReq.acUnitSerial || 'N/A',
          acWarrantyStatus: serviceReq.acWarrantyStatus || 'Unknown',
          acAmcStatus: serviceReq.acAmcStatus || 'Not Active',
          problemDescription: serviceReq.problemDescription || '',
          problemImageUrl: serviceReq.problemImageUrl || '',
          preferredDate: serviceReq.preferredDate,
          preferredTimeSlot: serviceReq.preferredTimeSlot || '',
          estimatedCharges: serviceReq.estimatedCharges || 0,
        },
        subtotal: Number(serviceReq.estimatedCharges || 0),
        additionalCharges: 0,
        total: Number(serviceReq.estimatedCharges || 0),
        paymentSlip: '',
        createdAt: serviceReq.createdAt,
        updatedAt: serviceReq.updatedAt,
      },
    };
  }

  const error = new Error(`No order or service record found for reference "${ref}"`);
  error.statusCode = 404;
  throw error;
};

/**
 * Returns recent customer orders sorted by creation date descending.
 */
exports.getRecentCustomerOrders = async ({ limit = 5 } = {}) => {
  const maxLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 5));

  const [orders, installOrders] = await Promise.all([
    Order.find()
      .populate('customer', 'fullName email phoneNumber address')
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .lean(),
    InstallationOrder.find()
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .lean(),
  ]);

  const userIds = installOrders
    .map((io) => io.userId)
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id));

  const users = userIds.length > 0
    ? await User.find({ _id: { $in: userIds } }).select('fullName email phoneNumber address').lean()
    : [];
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const combined = [];

  for (const o of orders) {
    const cust = o.customer || {};
    const shipping = o.shippingDetails || {};
    const customerName = cust.fullName || [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || 'Customer';
    const firstItem = o.items?.[0];
    const summary = firstItem
      ? `${firstItem.name || o.itemName || 'Product'}${o.items.length > 1 ? ` (+${o.items.length - 1} more)` : ''}`
      : o.itemName || 'Product Order';

    combined.push({
      id: String(o._id),
      category: 'Product Order',
      reference: o.orderRef || o.orderReference || o.orderId || `ORD-${String(o._id).slice(-6).toUpperCase()}`,
      customerName,
      customerEmail: cust.email || shipping.email || '',
      customerPhone: cust.phoneNumber || shipping.phone || '',
      summary,
      orderType: o.orderType || (firstItem?.purchaseType === 'buy_and_install' ? 'Buy & Install' : 'Buy Only'),
      total: Number(o.total || o.amount || 0),
      status: o.status || 'Pending',
      paymentStatus: o.paymentStatus || 'Pending Payment',
      orderStatus: o.orderStatus || 'Order Placed',
      createdAt: o.createdAt,
    });
  }

  for (const io of installOrders) {
    const cust = userMap.get(String(io.userId)) || {};
    const shipping = io.shippingDetails || {};
    const customerName = cust.fullName || [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || 'Customer';
    const firstItem = io.items?.[0];
    const summary = firstItem
      ? `${firstItem.name || 'AC Unit'}${io.items.length > 1 ? ` (+${io.items.length - 1} more)` : ''}`
      : 'AC Unit & Installation';

    combined.push({
      id: String(io._id),
      category: 'Installation Order',
      reference: io.orderReference || io.orderId || `INST-ORD-${String(io._id).slice(-6).toUpperCase()}`,
      customerName,
      customerEmail: cust.email || shipping.email || '',
      customerPhone: cust.phoneNumber || shipping.phone || '',
      summary,
      orderType: 'Buy & Install',
      total: Number(io.total || 0),
      status: io.status || 'Pending Review',
      paymentStatus: io.paymentStatus || 'Pending',
      orderStatus: io.status || 'Pending Review',
      createdAt: io.createdAt,
    });
  }

  combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return combined.slice(0, maxLimit);
};
