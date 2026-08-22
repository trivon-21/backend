const mongoose = require('mongoose');
const Inventory = require('../../models/Inventory');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const PurchaseRequest = require('../../models/PurchaseRequest');
const Procurement = require('../../models/Procurement');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const { isLowStock } = require('../../utils/inventory-domain');
const { buildAnalytics } = require('../../utils/manager-metrics');
const { loadManagerTickets } = require('./manager.ticket-read-model');

exports.getAnalyticsData = async (_user, periodKey) => {
  if (mongoose.connection.readyState !== 1) {
    const error = new Error('Manager analytics are unavailable while the database is offline');
    error.statusCode = 503;
    error.code = 'DATABASE_OFFLINE';
    throw error;
  }

  const [tickets, orders, inventory, pendingRequests, procurements, authorizations] = await Promise.all([
    loadManagerTickets(),
    PurchaseRequest.find({ status: { $ne: 'draft' } }).lean(),
    Inventory.find().lean(),
    WarehousePickRequest.countDocuments({ status: 'pending' }),
    Procurement.find().lean(),
    ReceiptAuthorization.find().lean(),
  ]);
  const generatedAt = new Date();
  const analytics = buildAnalytics(
    tickets,
    orders,
    periodKey,
    generatedAt,
    procurements,
    authorizations,
    inventory,
    pendingRequests,
  );

  return {
    ...analytics,
    status: 'Operational',
    generatedAt,
    inventorySignals: {
      lowStockAlerts: inventory.filter(isLowStock).length,
      outOfStockAlerts: analytics.inventoryRisk.outOfStockItems.value,
      reservedItems: inventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0),
      pendingRequests,
    },
  };
};
