'use strict';

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Order = require('../src/models/Order');

const APPLY_TOKEN = '--confirm-migration=MIGRATE-ORDER-COMPATIBILITY';

function prepareOrderOwnerUpdate(order) {
  const rawUserId = order.userId;
  const normalizedUserId = rawUserId == null ? '' : String(rawUserId);
  const update = {};
  if (rawUserId != null && typeof rawUserId !== 'string') update.userId = normalizedUserId;
  if (!order.customer && mongoose.Types.ObjectId.isValid(normalizedUserId)) {
    update.customer = new mongoose.Types.ObjectId(normalizedUserId);
  }
  if (!normalizedUserId && order.customer) update.userId = String(order.customer);
  return update;
}

async function migrateOrderCompatibility({ apply = false, confirmed = false, logger = console } = {}) {
  if (apply && !confirmed) throw new Error(`Applying the migration requires ${APPLY_TOKEN}`);
  const orders = await Order.collection.find({}).toArray();
  const operations = orders.flatMap((order) => {
    const update = prepareOrderOwnerUpdate(order);
    return Object.keys(update).length
      ? [{ updateOne: { filter: { _id: order._id }, update: { $set: update } } }]
      : [];
  });
  const summary = { mode: apply ? 'APPLY' : 'DRY_RUN', ordersScanned: orders.length, ordersChanged: operations.length };
  logger.table(summary);
  if (apply && operations.length) await Order.collection.bulkWrite(operations);
  if (!apply) logger.log(`No data changed. Re-run with --apply ${APPLY_TOKEN} after reviewing the summary.`);
  return summary;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes(APPLY_TOKEN);
  await connectDB();
  return migrateOrderCompatibility({ apply, confirmed });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(async () => mongoose.disconnect());
}

module.exports = { APPLY_TOKEN, migrateOrderCompatibility, prepareOrderOwnerUpdate };
