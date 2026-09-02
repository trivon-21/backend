'use strict';

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const APPLY_TOKEN = '--confirm-indexes=RECONCILE-MANAGER-INVENTORY-INDEXES';
const DESIRED_INDEXES = [
  { collection: 'inspection_tickets', key: { ticketRef: 1 }, options: { unique: true, name: 'ticketRef_1', sparse: true } },
  { collection: 'job_material_requests', key: { jobType: 1, jobId: 1 }, options: { unique: true, name: 'jobType_1_jobId_1' } },
  { collection: 'job_material_requests', key: { requestId: 1 }, options: { unique: true, name: 'requestId_1', partialFilterExpression: { requestId: { $type: 'string' } } } },
  { collection: 'warehouse_pick_requests', key: { sourceMaterialRequestId: 1 }, options: { unique: true, name: 'sourceMaterialRequestId_1', partialFilterExpression: { sourceMaterialRequestId: { $type: 'objectId' } } } },
  { collection: 'purchase_requests', key: { activeShortageKey: 1 }, options: { unique: true, name: 'activeShortageKey_1', partialFilterExpression: { activeShortageKey: { $type: 'string' } } } },
  { collection: 'purchase_requests', key: { poNumber: 1 }, options: { unique: true, name: 'poNumber_1', partialFilterExpression: { poNumber: { $type: 'string' } } } },
];

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function matchingIndex(indexes, desired) {
  return indexes.find((index) => stable(index.key) === stable(desired.key));
}
function indexNeedsReplacement(actual, desired) {
  if (!actual) return false;
  return Boolean(actual.unique) !== Boolean(desired.options.unique)
    || Boolean(actual.sparse) !== Boolean(desired.options.sparse)
    || stable(actual.partialFilterExpression || null) !== stable(desired.options.partialFilterExpression || null);
}

async function duplicateKeys(collection, desired) {
  const keyFields = Object.keys(desired.key);
  const match = desired.options.partialFilterExpression
    || Object.fromEntries(keyFields.map((field) => [field, { $exists: true, $ne: null }]));
  const groupId = Object.fromEntries(keyFields.map((field) => [field.replaceAll('.', '_'), `$${field}`]));
  return collection.aggregate([
    { $match: match },
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 },
  ]).toArray();
}

async function reconcileIndexes({ db, apply = false, confirmed = false, logger = console } = {}) {
  if (apply && !confirmed) throw new Error(`Applying index changes requires ${APPLY_TOKEN}`);
  const actions = [];
  for (const desired of DESIRED_INDEXES) {
    const collection = db.collection(desired.collection);
    const indexes = await collection.listIndexes().toArray().catch((error) => (
      error.codeName === 'NamespaceNotFound' ? [] : Promise.reject(error)
    ));
    const actual = matchingIndex(indexes, desired);
    const replace = indexNeedsReplacement(actual, desired);
    const duplicates = await duplicateKeys(collection, desired);
    const action = { collection: desired.collection, index: desired.options.name, state: actual && !replace ? 'current' : replace ? 'replace' : 'create', duplicateCount: duplicates.length };
    actions.push(action);
    if (duplicates.length) throw new Error(`Duplicate values prevent ${desired.collection}.${desired.options.name}`);
    if (apply && action.state !== 'current') {
      if (replace) await collection.dropIndex(actual.name);
      await collection.createIndex(desired.key, desired.options);
    }
  }
  logger.table(actions);
  if (!apply) logger.log(`No indexes changed. Re-run with --apply ${APPLY_TOKEN} after reviewing the plan.`);
  return actions;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes(APPLY_TOKEN);
  await connectDB();
  return reconcileIndexes({ db: mongoose.connection.db, apply, confirmed });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(async () => mongoose.disconnect());
}

module.exports = { APPLY_TOKEN, DESIRED_INDEXES, indexNeedsReplacement, matchingIndex, reconcileIndexes };
