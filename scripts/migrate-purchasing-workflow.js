'use strict';

const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const connectDB = require('../src/config/db');
const PurchaseRequest = require('../src/models/PurchaseRequest');
const Procurement = require('../src/models/Procurement');

const APPLY_TOKEN = '--confirm-migration=MIGRATE-PURCHASING-WORKFLOW';
const STATUS_MAP = {
  'pending-approval': 'pending-manager',
  PENDING: 'pending-finance',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};
const INACTIVE_SHORTAGE_STATUSES = new Set(['rejected', 'received', 'cancelled']);

function preparePurchaseUpdate(order) {
  const status = STATUS_MAP[order.status] || order.status;
  const items = (order.items || []).map((line) => ({
    ...line,
    lineId: line.lineId || randomUUID(),
    orderedQuantity: line.orderedQuantity ?? line.quantity ?? 0,
    receivedQuantity: line.receivedQuantity ?? 0,
  }));
  const update = { status, items, statusVersion: order.statusVersion ?? 0 };
  if (!order.requestedById) update.requestedById = null;
  if (status === 'approved' && !order.operationalApproval?.status) {
    update.operationalApproval = {
      status: 'approved', actorName: order.approvedBy || 'Legacy approval',
      comment: 'Grandfathered during manager-first workflow migration', decidedAt: order.approvedAt || order.updatedAt,
    };
    update.financialApproval = {
      status: 'not-required', actorName: 'Manager-first rollout',
      comment: 'Finance was not required when this request was approved', decidedAt: order.approvedAt || order.updatedAt,
    };
  }
  if (status === 'rejected' && !order.operationalApproval?.status) {
    update.operationalApproval = {
      status: 'rejected', actorName: order.approvedBy || 'Legacy decision',
      comment: order.rejectionReason || 'Migrated rejection', decidedAt: order.rejectedAt || order.updatedAt,
    };
  }
  if (order.source === 'material-request' && order.sourceMaterialRequestId && order.supplierId
    && !INACTIVE_SHORTAGE_STATUSES.has(status)) {
    update.activeShortageKey = `${order.sourceMaterialRequestId}:${order.supplierId}`;
  } else if (order.activeShortageKey !== undefined) {
    update.activeShortageKey = null;
  }

  const linesChanged = items.some((line, index) => {
    const original = (order.items || [])[index] || {};
    return !original.lineId || original.orderedQuantity === undefined || original.receivedQuantity === undefined;
  });
  const shortageChanged = (update.activeShortageKey ?? null) !== (order.activeShortageKey ?? null);
  const changed = status !== order.status || linesChanged || order.statusVersion === undefined
    || !order.requestedById || Boolean(update.operationalApproval) || shortageChanged;
  return { changed, update };
}

function findDuplicateShortageKeys(prepared) {
  const counts = new Map();
  for (const { update } of prepared) {
    if (typeof update.activeShortageKey !== 'string') continue;
    counts.set(update.activeShortageKey, (counts.get(update.activeShortageKey) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }));
}

async function migrate({ apply = false, confirmed = false, logger = console } = {}) {
  if (apply && !confirmed) throw new Error(`Applying the migration requires ${APPLY_TOKEN}`);
  const orders = await PurchaseRequest.collection.find({}).toArray();
  const procurements = await Procurement.collection.find({}).toArray();
  const prepared = orders.map((order) => ({ order, ...preparePurchaseUpdate(order) }));
  const duplicates = findDuplicateShortageKeys(prepared);
  const orderOps = prepared.filter((entry) => entry.changed).map(({ order, update }) => ({
    updateOne: { filter: { _id: order._id }, update: { $set: update } },
  }));
  const procurementOps = procurements.filter((item) => !item.receiptMode).map((item) => ({
    updateOne: { filter: { _id: item._id }, update: { $set: {
      receiptMode: 'LEGACY', sourceDocumentNumber: item.sourceDocumentNumber || item.invoiceNumber || '',
    } } },
  }));
  const summary = {
    mode: apply ? 'APPLY' : 'DRY_RUN', ordersScanned: orders.length,
    ordersChanged: orderOps.length, procurementsChanged: procurementOps.length,
    duplicateActiveShortageKeys: duplicates,
  };
  logger.table({ ...summary, duplicateActiveShortageKeys: duplicates.length });
  if (duplicates.length) throw new Error(`Duplicate activeShortageKey values detected: ${duplicates.length}`);
  if (apply) {
    if (orderOps.length) await PurchaseRequest.bulkWrite(orderOps);
    if (procurementOps.length) await Procurement.bulkWrite(procurementOps);
  } else logger.log(`No data changed. Re-run with --apply ${APPLY_TOKEN} after reviewing the summary.`);
  return summary;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes(APPLY_TOKEN);
  await connectDB();
  return migrate({ apply, confirmed });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(async () => mongoose.disconnect());
}

module.exports = { APPLY_TOKEN, findDuplicateShortageKeys, migrate, preparePurchaseUpdate };
