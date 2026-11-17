'use strict';

const service = require('./manager.customer-orders.service');

/**
 * GET /api/manager/orders/lookup?ref=...
 * Looks up an order or service request by reference or ID.
 */
exports.lookupOrder = async (req, res) => {
  try {
    const ref = req.query.ref;
    if (!ref || !String(ref).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Order reference or ID query parameter (ref) is required',
      });
    }

    const result = await service.lookupOrder(ref);
    return res.json(result);
  } catch (error) {
    console.error('Manager order lookup error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to lookup order',
    });
  }
};

/**
 * GET /api/manager/recent-orders?limit=...
 * Retrieves recent customer orders for the Manager dashboard or view-all panel.
 */
exports.getRecentOrders = async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 5;
    const orders = await service.getRecentCustomerOrders({ limit });
    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error('Manager recent orders error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch recent orders',
      orders: [],
    });
  }
};
