const mongoose = require('mongoose');
const Inventory = require('../../models/Inventory');
const MaterialRequest = require('../../models/MaterialRequest');
const OrderRequest = require('../../models/OrderRequest');
const Ticket = require('../../models/Ticket');
const Procurement = require('../../models/Procurement');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const { isLowStock } = require('../../utils/inventory-domain');
const { buildAnalytics } = require('../../utils/manager-metrics');

exports.getAnalyticsData = async (_user, periodKey) => {
  if (mongoose.connection.readyState !== 1) {
    const error = new Error('Manager analytics are unavailable while the database is offline');
    error.statusCode = 503;
    error.code = 'DATABASE_OFFLINE';
    throw error;
  }

  const [tickets, orders, inventory, pendingRequests, procurements, authorizations] = await Promise.all([
    Ticket.find().lean(),
    OrderRequest.find({ status: { $ne: 'draft' } }).lean(),
    Inventory.find().lean(),
    MaterialRequest.countDocuments({ status: 'pending' }),
    Procurement.find().lean(),
    ReceiptAuthorization.find().lean(),
  ]);
  const analytics = buildAnalytics(tickets, orders, periodKey, new Date(), procurements, authorizations);

  return {
    ...analytics,
    status: 'Operational',
    generatedAt: new Date(),
    inventorySignals: {
      lowStockAlerts: inventory.filter(isLowStock).length,
      reservedItems: inventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0),
      pendingRequests,
    },
  };
};
