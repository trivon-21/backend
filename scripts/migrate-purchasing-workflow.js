const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
require('dotenv').config();
const connectDB = require('../src/config/db');
const PurchaseRequest = require('../src/models/PurchaseRequest');
const Procurement = require('../src/models/Procurement');

const STATUS_MAP = {
  'pending-approval': 'pending-manager',
  PENDING: 'pending-finance',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

async function migrate() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const orders = await PurchaseRequest.collection.find({}).toArray();
  const procurements = await Procurement.collection.find({}).toArray();
  const orderOps = [];
  const procurementOps = [];
  const summary = { ordersScanned: orders.length, ordersChanged: 0, procurementsChanged: 0 };

  for (const order of orders) {
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
    const changed = status !== order.status || (order.items || []).some((line) => !line.lineId)
      || order.statusVersion === undefined || update.operationalApproval;
    if (changed) {
      summary.ordersChanged += 1;
      orderOps.push({ updateOne: { filter: { _id: order._id }, update: { $set: update } } });
    }
  }

  for (const procurement of procurements) {
    if (!procurement.receiptMode) {
      summary.procurementsChanged += 1;
      procurementOps.push({
        updateOne: {
          filter: { _id: procurement._id },
          update: { $set: {
            receiptMode: 'LEGACY',
            sourceDocumentNumber: procurement.sourceDocumentNumber || procurement.invoiceNumber || '',
          } },
        },
      });
    }
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} purchasing workflow migration`);
  console.table(summary);
  if (!apply) {
    console.log('No data was changed. Re-run with --apply after reviewing this summary.');
  } else {
    if (orderOps.length) await PurchaseRequest.bulkWrite(orderOps);
    if (procurementOps.length) await Procurement.bulkWrite(procurementOps);
  }
  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
