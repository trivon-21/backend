const mongoose = require('mongoose');
const Inventory = require('../../models/Inventory');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const PurchaseRequest = require('../../models/PurchaseRequest');
const Procurement = require('../../models/Procurement');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const CustomerOrder = require('../../models/Order');
const Invoice = require('../finance/Invoice.model');
const { isLowStock, findBlockedMaterialRequests } = require('../../utils/inventory-domain');
const { buildAnalytics } = require('../../utils/manager-metrics');
const { loadManagerTickets } = require('./manager.ticket-read-model');
const { managerCache } = require('./manager.cache');

exports.getAnalyticsData = async (_user, periodKey) => {
  if (mongoose.connection.readyState !== 1) {
    const error = new Error('Manager analytics are unavailable while the database is offline');
    error.statusCode = 503;
    error.code = 'DATABASE_OFFLINE';
    throw error;
  }

  return managerCache.get(`manager:analytics:${periodKey}`, () => buildAnalyticsPayload(periodKey));
};

async function buildAnalyticsPayload(periodKey) {
  const [tickets, orders, inventory, pendingRequests, procurements, authorizations, customerOrders, invoices] = await Promise.all([
    loadManagerTickets(),
    PurchaseRequest.find({ status: { $ne: 'draft' } }).lean(),
    Inventory.find().lean(),
    WarehousePickRequest.find({ status: 'pending' }).lean(),
    Procurement.find().lean(),
    ReceiptAuthorization.find().lean(),
    CustomerOrder.find()
      .select('_id amount total subtotal items.price items.quantity status paymentStatus approvedAt updatedAt')
      .lean(),
    Invoice.find()
      .select('_id orderId invoiceType grandTotal status paidAt acceptedAt updatedAt')
      .lean(),
  ]);
  const generatedAt = new Date();
  const pendingRequestsCount = pendingRequests.length;
  const blockedMaterialRequests = findBlockedMaterialRequests(pendingRequests, inventory).length;
  const analytics = buildAnalytics(
    tickets,
    orders,
    periodKey,
    generatedAt,
    procurements,
    authorizations,
    inventory,
    pendingRequestsCount,
    customerOrders,
    invoices,
  );

  return {
    ...analytics,
    status: 'Operational',
    generatedAt,
    inventorySignals: {
      lowStockAlerts: inventory.filter(isLowStock).length,
      outOfStockAlerts: analytics.inventoryRisk.outOfStockItems.value,
      reservedItems: inventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0),
      pendingRequests: pendingRequestsCount,
      blockedMaterialRequests,
    },
  };
}
