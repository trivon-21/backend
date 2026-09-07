/**
 * Manager Service
 * Handles operations that require manager/admin approval
 */

const { executePaymentAutoCancelJob } = require("../../jobs/paymentAutoCancelJob");
const configCache = require("../../utils/config-cache");
const mongoose = require('mongoose');
const Inventory = require('../../models/Inventory');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const PurchaseRequest = require('../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const { isLowStock } = require('../../utils/inventory-domain');
const { loadManagerTickets } = require('./manager.ticket-read-model');
const { buildDashboardMetrics } = require('./manager.dashboard-metrics');

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

  const [tickets, orders, inventory, materialRequests, authorizations] = await Promise.all([
    loadManagerTickets(),
    PurchaseRequest.find({ status: { $ne: 'draft' } }).sort({ updatedAt: -1 }).lean(),
    Inventory.find().sort({ updatedAt: -1 }).lean(),
    WarehousePickRequest.find({ status: 'pending' }).lean(),
    ReceiptAuthorization.find().sort({ updatedAt: -1 }).lean(),
  ]);

  return buildDashboardMetrics({
    tickets,
    orders,
    inventory,
    materialRequests,
    authorizations,
    now: new Date(),
    user,
  });
};

/**
 * Trigger payment auto-cancel job manually
 * @returns {Promise<Object>}
 */
exports.triggerPaymentAutoCancelJob = async () => {
  return await executePaymentAutoCancelJob();
};
