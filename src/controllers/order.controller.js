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

    const { paymentSlipUrl, paymentSlip, slip } = req.body;
    const slipData = paymentSlipUrl || paymentSlip || slip || "";
    order.paymentSlipUrl = slipData;
    order.paymentSlip = slipData;
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

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const InstallationOrder = require('../models/installationOrder.model');
const Cart = require('../models/cart.model');
const Counter = require('../models/counter.model');

// ── Multer setup (In-Memory for MongoDB Base64 storage) ───────────────────────
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  allowed.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Only PNG, JPG, JPEG, and PDF files are allowed'));
};

exports.upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// ── Shared Initialization Logic ──────────────────────────────────────────────
async function performInitialization(req, res, Model, prefix, purchaseType, counterId) {
  try {
    const { userId, selectedItems, consultationCompleted } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    let cart = await Cart.findOne({ userId }).populate('items.product');
    if (!cart) {
      console.log(`[Order] No cart found for user: ${userId}. Creating empty cart.`);
      cart = new Cart({ userId, items: [] });
      await cart.save();
    }

    if (cart.items.length === 0) {
      console.warn(`[Order] Cart empty for user: ${userId}`);
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    let cartItems = cart.items;
    // Only filter if selectedItems is provided and is a non-empty array
    if (selectedItems && Array.isArray(selectedItems) && selectedItems.length > 0) {
      console.log(`[Order] Filtering cart items by selection:`, selectedItems);
      cartItems = cartItems.filter(item => {
        const pid = item.product?._id ? item.product._id.toString() : item.product?.toString();
        const matched = selectedItems.includes(pid);
        if (!matched) console.log(`[Order] Item ${pid} not in selection`);
        return matched;
      });
    } else {
      console.log(`[Order] No selection provided or empty. Using all ${cartItems.length} items from cart.`);
    }

    if (cartItems.length === 0) {
      console.warn(`[Order] No valid items found for user: ${userId} with selectedItems:`, selectedItems);
      return res.status(400).json({ success: false, message: 'No valid items selected' });
    }

    const items = cartItems.map(item => {
      const prod = item.product || {};
      return {
        productId: prod._id ? prod._id.toString() : item.product?.toString() || 'unknown',
        name: prod.name || 'Unknown Product',
        price: prod.price || 0,
        quantity: item.quantity,
        purchaseType: purchaseType
      };
    });

    let counter;
    try {
      counter = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
    } catch (cErr) {
      console.error(`[Order] Counter update failed for ${counterId}:`, cErr);
      throw new Error(`Failed to generate order sequence: ${cErr.message}`);
    }

    if (!counter || typeof counter.seq !== 'number') {
      console.error(`[Order] Invalid counter state for ${counterId}:`, counter);
      throw new Error('Failed to generate valid sequence number');
    }

    const sequenceNum = counter.seq.toString().padStart(4, '0');
    const orderReference = `${prefix}-${sequenceNum}`;
    console.log(`[Order] Generated reference: ${orderReference} for ${purchaseType}`);

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const total = subtotal;

    const order = new Model({
      orderReference,
      orderId: orderReference,
      userId,
      items,
      subtotal,
      total,
      status: purchaseType === 'buy_and_install' ? 'Pending Review' : 'Pending Payment',
      consultationCompleted: !!consultationCompleted
    });

    await order.save();
    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(500).json({ success: false, message: 'Duplicate order reference. Please try again.' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ── Step 1: Initialize Buy-Only Order ───────────────────────────────────────
exports.createBuyOnlyOrder = (req, res) => performInitialization(req, res, Order, 'ALX-BO', 'buy_only', 'orderReference_BO');

// ── Step 1.1: Initialize Buy & Install Order ─────────────────────────────────
exports.createBuyAndInstallOrder = (req, res) => performInitialization(req, res, InstallationOrder, 'ALX-BI', 'buy_and_install', 'orderReference_BI');

// ── Step 2: Submit Payment & Shipping ─────────────────────────────────────────
exports.submitPayment = async (req, res) => {
  try {
    const { orderReference, firstName, lastName, email, phone, address, city, postalCode, paymentSlipUrl, slip } = req.body;

    if (!orderReference) throw new Error('Order Reference is required');

    // Determine which collection to look in
    const isBO = orderReference.startsWith('ALX-BO');
    const Model = isBO ? Order : InstallationOrder;

    const order = await Model.findOne({ orderReference });
    if (!order) throw new Error('Order not found');

    // For Buy Only, slip is always required. For Buy & Install, it is optional.
    const isBuyOnly = isBO;

    let slipData = null;
    if (req.file) {
      slipData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    } else if (paymentSlipUrl || slip) {
      slipData = paymentSlipUrl || slip;
    }

    if (isBuyOnly && !slipData) {
      throw new Error('Payment slip is required for Buy Only orders');
    }

    if (slipData) {
      order.paymentSlip = slipData;
      order.paymentSlipUrl = slipData;
      order.paymentStatus = 'Under Review';
      order.status = 'Under Review (Finance)';
    } else {
      // No file provided (allowed for Buy & Install)
      order.status = 'Under Review (Finance)';
    }

    // 2. Update Shipping Details
    order.shippingDetails = {
      firstName,
      lastName,
      email,
      phone,
      address,
      city,
      postalCode
    };

    // 3. Update Status
    order.status = isBO ? 'Under Review (Finance)' : 'Pending Review';
    if (isBO) order.orderType = 'Buy Only';

    await order.save();

    // 4. Clear items from Cart
    const cart = await Cart.findOne({ userId: order.userId });
    if (cart) {
      const orderProductIds = order.items.map(i => i.productId);
      cart.items = cart.items.filter(item => !orderProductIds.includes(item.product.toString()));
      await cart.save();
    }

    res.json({
      success: true,
      message: 'Order submitted successfully for Finance review',
      orderId: order.orderReference,
      data: order
    });

  } catch (err) {
    console.error('[Order] submitPayment error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ── Other Helpers ────────────────────────────────────────────────────────────
exports.getOrdersByUser = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId });
    const installationOrders = await InstallationOrder.find({ userId: req.params.userId });

    // Combine and sort by date
    const allOrders = [...orders, ...installationOrders].sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, data: allOrders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const isBO = req.params.id.startsWith('ALX-BO');
    const Model = isBO ? Order : InstallationOrder;

    const order = await Model.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
