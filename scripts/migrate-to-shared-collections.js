const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
require('dotenv').config();
const connectDB = require('../src/config/db');

async function exists(db, name) {
  return db.listCollections({ name }).hasNext();
}

async function rows(db, name, filter = {}) {
  return await exists(db, name) ? db.collection(name).find(filter).toArray() : [];
}

function withoutId(document) {
  const { _id, sourceLegacyId, legacyReadOnly, ...copy } = document;
  return copy;
}

function insertIfMissing(key, document) {
  return {
    updateOne: {
      filter: { [key]: document[key] },
      update: { $setOnInsert: withoutId(document) },
      upsert: true,
    },
  };
}

async function migrate() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const db = mongoose.connection.db;
  const [legacyDispatch, legacyPicks, legacyPurchases] = await Promise.all([
    rows(db, 'orders', {
      orderId: { $type: 'string' }, customer: { $exists: true }, 'items.qty': { $exists: true },
    }),
    rows(db, 'material_requests'),
    rows(db, 'order_requests'),
  ]);

  const eligiblePurchases = legacyPurchases.filter((request) =>
    !request.legacyReadOnly
    && request.requestId
    && request.supplierName
    && request.requestedBy
    && Array.isArray(request.items)
    && request.items.length > 0
    && request.items.every((item) => item.inventoryId),
  );
  const skippedPurchases = legacyPurchases.length - eligiblePurchases.length;
  const dispatchOps = legacyDispatch.filter((item) => item.orderId).map((item) => insertIfMissing('orderId', item));
  const pickOps = legacyPicks.filter((item) => item.requestId).map((item) => insertIfMissing('requestId', item));
  const purchaseOps = eligiblePurchases.map((item) => insertIfMissing('requestId', {
    ...item,
    status: item.status === 'pending-approval' ? 'pending-manager' : item.status,
    statusVersion: Number(item.statusVersion || 0),
    items: item.items.map((line) => ({
      ...line,
      lineId: line.lineId || randomUUID(),
      orderedQuantity: Number(line.orderedQuantity ?? line.quantity ?? 0),
      receivedQuantity: Number(line.receivedQuantity || 0),
    })),
  }));

  const loanStatusOps = (await rows(db, 'asset_loans', { status: { $exists: false } })).map((loan) => ({
    updateOne: { filter: { _id: loan._id, status: { $exists: false } }, update: { $set: { status: 'on-loan' } } },
  }));
  const pricingOps = (await rows(db, 'inventory', { 'pricing.costPerUnit': { $exists: false } })).map((item) => ({
    updateOne: {
      filter: { _id: item._id, 'pricing.costPerUnit': { $exists: false } },
      update: { $set: { 'pricing.costPerUnit': Number(item.unitCost || 0) } },
    },
  }));

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} shared collection migration`);
  console.table({
    dispatchOrdersEligible: dispatchOps.length,
    warehousePickRequestsEligible: pickOps.length,
    purchaseRequestsEligible: purchaseOps.length,
    purchaseRequestsSkippedForManualReview: skippedPurchases,
    assetLoansReceivingDefaultStatus: loanStatusOps.length,
    inventoryItemsReceivingPricingCost: pricingOps.length,
  });
  console.log('Generic tickets, logistics snapshots, and asset return logs are intentionally not copied.');

  if (apply) {
    if (dispatchOps.length) await db.collection('dispatch_orders').bulkWrite(dispatchOps);
    if (pickOps.length) await db.collection('warehouse_pick_requests').bulkWrite(pickOps);
    if (purchaseOps.length) await db.collection('purchase_requests').bulkWrite(purchaseOps);
    if (loanStatusOps.length) await db.collection('asset_loans').bulkWrite(loanStatusOps);
    if (pricingOps.length) await db.collection('inventory').bulkWrite(pricingOps);
  } else {
    console.log('No data was changed. Review the counts before running with --apply.');
  }
  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
