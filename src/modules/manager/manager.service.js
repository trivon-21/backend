/**
 * Manager Service
 * Handles operations that require manager/admin approval
 */

const { executePaymentAutoCancelJob } = require("../../jobs/paymentAutoCancelJob");
const mongoose = require('mongoose');
const Inventory = require('../../models/Inventory');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const PurchaseRequest = require('../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const { isLowStock } = require('../../utils/inventory-domain');
const { loadManagerTickets } = require('./manager.ticket-read-model');
const { buildDashboardMetrics } = require('./manager.dashboard-metrics');
const { managerCache } = require('./manager.cache');

const DASHBOARD_CACHE_KEY = 'manager:dashboard';

// Projections limited to the fields buildDashboardMetrics actually reads.
const ORDER_FIELDS = 'status priority totalEstimate totalAmount createdAt requestId '
  + 'supplierName items source sourceMaterialRequestId';
const INVENTORY_FIELDS = 'available reorderLevel reserved sku name';
const AUTHORIZATION_FIELDS = 'status priority nonPoReason estimatedTotal totalAmount '
  + 'createdAt authorizationNumber supplierName';

// Add service methods here
exports.placeholder = () => {
  return "Placeholder for Manager service";
};

function serviceError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = 'DATABASE_OFFLINE';
  return error;
}

exports.getDashboardData = async (user) => {
  if (mongoose.connection.readyState !== 1) {
    throw serviceError('Manager dashboard is unavailable while the database is offline');
  }

  // The composed payload is user-independent apart from managerName, so it is
  // cached once and re-stamped per caller below.
  const metrics = await managerCache.get(DASHBOARD_CACHE_KEY, async () => {
    const [tickets, orders, inventory, materialRequests, authorizations] = await Promise.all([
      loadManagerTickets(),
      PurchaseRequest.find({ status: { $ne: 'draft' } }).select(ORDER_FIELDS).lean(),
      Inventory.find().select(INVENTORY_FIELDS).lean(),
      WarehousePickRequest.find({ status: 'pending' }).lean(),
      ReceiptAuthorization.find().select(AUTHORIZATION_FIELDS).lean(),
    ]);

    return buildDashboardMetrics({
      tickets,
      orders,
      inventory,
      materialRequests,
      authorizations,
      now: new Date(),
      user: null,
    });
  });

  return { ...metrics, managerName: user?.fullName || 'Manager' };
};

/**
 * Trigger payment auto-cancel job manually
 * @returns {Promise<Object>}
 */
exports.triggerPaymentAutoCancelJob = async () => {
  return await executePaymentAutoCancelJob();
};
