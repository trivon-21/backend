const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
require('dotenv').config();
const OrderRequest = require('../src/models/OrderRequest');
const Procurement = require('../src/models/Procurement');

const STATUS_MAP = {
  'pending-approval': 'pending-manager',
  PENDING: 'pending-finance',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

async function collectionExists(name) {
  const collections = await mongoose.connection.db.listCollections({ name }).toArray();
  return collections.length > 0;
}

async function migrate() {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);

  const orders = await OrderRequest.collection.find({}).toArray();
  const procurements = await Procurement.collection.find({}).toArray();
  const orderOps = [];
  const procurementOps = [];
  const summary = { ordersScanned: orders.length, ordersChanged: 0, procurementsChanged: 0, financeHistoryImported: 0 };

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

  const financeCollectionName = 'l_purchaserequests';
  const financeImports = [];
  if (await collectionExists(financeCollectionName)) {
    const financeRows = await mongoose.connection.db.collection(financeCollectionName).find({}).toArray();
    const existingIds = new Set((await OrderRequest.find({ sourceLegacyId: { $exists: true } }).select('sourceLegacyId').lean())
      .map(row => row.sourceLegacyId));
    for (const row of financeRows) {
      const sourceLegacyId = `L_PurchaseRequest:${row._id}`;
      if (existingIds.has(sourceLegacyId)) continue;
      financeImports.push({
        requestId: `FIN-LEGACY-${String(row._id).slice(-8).toUpperCase()}`,
        sourceLegacyId,
        legacyReadOnly: true,
        supplierName: 'Legacy Finance Record',
        requestedBy: row.requestedBy || 'Inventory Manager',
        status: STATUS_MAP[row.status] || 'cancelled',
        items: (row.items || []).map((item) => ({
          lineId: randomUUID(), name: item.itemName || 'Legacy item', sku: 'UNLINKED',
          quantity: Number(item.quantity || 0), orderedQuantity: Number(item.quantity || 0),
          receivedQuantity: 0, unitCost: Number(item.unitPrice || 0), estimatedTotal: Number(item.total || 0),
        })),
        totalEstimate: Number(row.totalAmount || 0),
        notes: `Imported read-only Finance history. ${row.reason || ''}`.trim(),
        rejectionReason: row.rejectionReason || '',
        approvedBy: row.reviewedBy || '',
        approvedAt: row.approvedAt,
        rejectedAt: row.rejectedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
    summary.financeHistoryImported = financeImports.length;
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} purchasing workflow migration`);
  console.table(summary);
  if (!apply) {
    console.log('No data was changed. Re-run with --apply after reviewing this summary.');
  } else {
    if (orderOps.length) await OrderRequest.bulkWrite(orderOps);
    if (procurementOps.length) await Procurement.bulkWrite(procurementOps);
    if (financeImports.length) await OrderRequest.insertMany(financeImports, { ordered: false });
  }
  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
