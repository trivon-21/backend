const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../src/config/db');
const { ITEM_CLASSES, ITEM_SUBCATEGORIES, deriveStockStatus } = require('../src/utils/inventory-domain');
const { PURCHASE_STATUSES, LEGACY_PURCHASE_STATUSES } = require('../src/utils/purchase-workflow');

function ids(rows) {
  return new Set(rows.map((row) => String(row._id)));
}

async function audit() {
  await connectDB();
  const db = mongoose.connection.db;
  const [inventory, orders, receipts, authorizations, tickets, loans, users, suppliers, materials, dispatches] = await Promise.all([
    db.collection('inventory').find({}).toArray(),
    db.collection('order_requests').find({}).toArray(),
    db.collection('procurements').find({}).toArray(),
    db.collection('receipt_authorizations').find({}).toArray(),
    db.collection('tickets').find({}).toArray(),
    db.collection('asset_loans').find({}).toArray(),
    db.collection('user').find({}).project({ _id: 1 }).toArray(),
    db.collection('suppliers').find({}).project({ _id: 1 }).toArray(),
    db.collection('material_requests').find({}).toArray(),
    db.collection('orders').find({}).toArray(),
  ]);

  const inventoryIds = ids(inventory);
  const supplierIds = ids(suppliers);
  const userIds = ids(users);
  const serialOwners = new Map();
  let duplicateLocalSerials = 0;
  let duplicateGlobalSerials = 0;
  for (const item of inventory) {
    const serials = (item.serialNumbers || []).map(String);
    duplicateLocalSerials += serials.length - new Set(serials).size;
    for (const serial of new Set(serials)) {
      if (serialOwners.has(serial) && serialOwners.get(serial) !== String(item._id)) duplicateGlobalSerials += 1;
      else serialOwners.set(serial, String(item._id));
    }
  }

  const validPurchaseStatuses = new Set([...PURCHASE_STATUSES, ...LEGACY_PURCHASE_STATUSES]);
  const legacyOrUnclassified = inventory.filter((item) => item.itemClass === 'Unclassified' || item.subcategory === 'Unclassified').length;
  const invalidClassification = inventory.filter((item) =>
    !ITEM_CLASSES.includes(item.itemClass)
      || !(ITEM_SUBCATEGORIES[item.itemClass] || []).includes(item.subcategory)).length;

  const report = {
    inventory: {
      total: inventory.length,
      missingRequired: inventory.filter((item) => !item.name || !item.sku || !item.brand || !item.category).length,
      legacyOrUnclassified,
      invalidClassification,
      invalidQuantities: inventory.filter((item) =>
        [item.available, item.reserved, item.reorderLevel, item.maxStockLevel, item.unitCost].some((value) => Number(value) < 0)).length,
      invalidThresholds: inventory.filter((item) => Number(item.maxStockLevel || 0) < Number(item.reorderLevel || 0)).length,
      staleStatus: inventory.filter((item) => ({
        'out-of-stock': 'critical', 'low-stock': 'warning', 'in-stock': 'normal',
      })[deriveStockStatus(item.available, item.reorderLevel)] !== item.status).length,
      duplicateLocalSerials,
      duplicateGlobalSerials,
      danglingSupplier: inventory.filter((item) => item.supplierId && !supplierIds.has(String(item.supplierId))).length,
    },
    purchaseRequests: {
      total: orders.length,
      invalidStatus: orders.filter((order) => !validPurchaseStatuses.has(order.status)).length,
      missingSupplier: orders.filter((order) => !order.supplierName).length,
      danglingSupplier: orders.filter((order) => order.supplierId && !supplierIds.has(String(order.supplierId))).length,
      invalidLines: orders.filter((order) => !(order.items || []).length || (order.items || []).some((line) =>
        !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 || Number(line.unitCost || 0) < 0)).length,
      overReceived: orders.filter((order) => (order.items || []).some((line) =>
        Number(line.receivedQuantity || 0) > Number(line.orderedQuantity ?? line.quantity ?? 0))).length,
      unlinkedCatalogLines: orders.filter((order) => (order.items || []).some((line) =>
        !line.inventoryId || !inventoryIds.has(String(line.inventoryId)))).length,
    },
    receipts: {
      total: receipts.length,
      invalidModeReference: receipts.filter((receipt) =>
        (receipt.receiptMode === 'PO' && (!receipt.orderRequestId || !receipt.orderLineId))
          || (receipt.receiptMode === 'NON_PO' && !receipt.receiptAuthorizationId)).length,
      invalidQuantityOrCost: receipts.filter((receipt) =>
        !Number.isInteger(Number(receipt.quantity)) || Number(receipt.quantity) <= 0
          || Number(receipt.unitCost || 0) < 0 || Number(receipt.totalCost || 0) < 0).length,
      danglingInventory: receipts.filter((receipt) => receipt.inventoryId && !inventoryIds.has(String(receipt.inventoryId))).length,
    },
    authorizations: {
      total: authorizations.length,
      missingItemSource: authorizations.filter((authorization) => !authorization.inventoryId && !authorization.newItemSnapshot).length,
      overReceived: authorizations.filter((authorization) =>
        Number(authorization.receivedQuantity || 0) > Number(authorization.authorizedQuantity || 0)).length,
      danglingSupplier: authorizations.filter((authorization) =>
        authorization.supplierId && !supplierIds.has(String(authorization.supplierId))).length,
    },
    tickets: {
      total: tickets.length,
      resolvedWithoutTimestamp: tickets.filter((ticket) => ticket.status === 'resolved' && !ticket.resolvedAt).length,
      timestampOnOpenTicket: tickets.filter((ticket) => ticket.status !== 'resolved' && ticket.resolvedAt).length,
      danglingTechnician: tickets.filter((ticket) =>
        ticket.assignedTechnicianId && !userIds.has(String(ticket.assignedTechnicianId))).length,
      danglingCustomer: tickets.filter((ticket) => ticket.customerId && !userIds.has(String(ticket.customerId))).length,
    },
    assetLoans: {
      total: loans.length,
      nonCanonicalTechnician: loans.filter((loan) =>
        !loan.technicianUserId || !userIds.has(String(loan.technicianUserId))).length,
      danglingTool: loans.filter((loan) => !loan.toolId || !inventoryIds.has(String(loan.toolId))).length,
      unknownAssetTag: loans.filter((loan) => !serialOwners.has(String(loan.assetTag))).length,
    },
    secondary: {
      invalidMaterialQuantities: materials.filter((request) => (request.items || []).some((item) =>
        !Number.isInteger(Number(item.qty)) || Number(item.qty) <= 0)).length,
      invalidDispatchQuantities: dispatches.filter((order) => (order.items || []).some((item) =>
        !Number.isInteger(Number(item.qty)) || Number(item.qty) <= 0)).length,
    },
  };

  console.log('READ-ONLY Manager/Inventory schema integrity audit');
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

audit().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
