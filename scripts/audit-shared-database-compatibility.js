const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../src/config/db');

async function count(db, collection, filter = {}) {
  const exists = await db.listCollections({ name: collection }).hasNext();
  return exists ? db.collection(collection).countDocuments(filter) : 0;
}

async function audit() {
  await connectDB();
  const db = mongoose.connection.db;
  const summary = {
    legacyDispatchOrders: await count(db, 'orders', {
      orderId: { $type: 'string' }, customer: { $exists: true }, 'items.qty': { $exists: true },
    }),
    dispatchOrders: await count(db, 'dispatch_orders'),
    legacyMaterialRequests: await count(db, 'material_requests'),
    warehousePickRequests: await count(db, 'warehouse_pick_requests'),
    legacyOrderRequests: await count(db, 'order_requests'),
    purchaseRequests: await count(db, 'purchase_requests'),
    legacyGenericTickets: await count(db, 'tickets'),
    serviceTickets: await count(db, 'service_tickets'),
    inspectionTickets: await count(db, 'inspection_tickets'),
    installations: await count(db, 'installations'),
    legacyLogisticsSnapshots: await count(db, 'logistics'),
    legacyAssetReturnLogs: await count(db, 'asset_return_logs'),
    assetLoansMissingStatus: await count(db, 'asset_loans', { status: { $exists: false } }),
    inventoryMissingPricing: await count(db, 'inventory', { 'pricing.costPerUnit': { $exists: false } }),
  };

  console.log('READ-ONLY shared database compatibility audit');
  console.table(summary);
  console.log('Manual review is required for generic tickets, logistics snapshots, and asset return history.');
  console.log('No shared schema additions are required by the adapted application.');
  await mongoose.disconnect();
}

audit().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
