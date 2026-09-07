const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');
const User = require('../../src/models/User');
const Supplier = require('../../src/models/Supplier');
const Inventory = require('../../src/models/Inventory');
const ReceiptAuthorization = require('../../src/models/ReceiptAuthorization');
const PurchaseRequest = require('../../src/models/PurchaseRequest');
const Procurement = require('../../src/models/Procurement');
const ReceiptDiscrepancy = require('../../src/models/ReceiptDiscrepancy');
const QuarantineItem = require('../../src/models/QuarantineItem');
const Activity = require('../../src/models/Activity');

const uri = process.env.INVENTORY_AUDIT_MONGO_URI;

async function resetAuditDatabase() {
  if (mongoose.connection.name !== 'airlux_inventory_audit') {
    throw new Error(`Refusing to reset unexpected database ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();
}

test('good, damaged, incomplete, and replacement receipts preserve stock disposition', {
  skip: !uri,
}, async () => {
  await mongoose.connect(uri);
  try {
    await resetAuditDatabase();
    await Promise.all([
      User.init(), Supplier.init(), Inventory.init(), ReceiptAuthorization.init(),
      PurchaseRequest.init(), Procurement.init(), ReceiptDiscrepancy.init(), QuarantineItem.init(), Activity.init(),
    ]);
    const user = await User.create({ fullName: 'Audit Inventory', role: 'INVENTORY' });
    const supplier = await Supplier.create({ name: 'Fabricated Receipt Supplier' });
    const item = await Inventory.create({
      name: 'Fabricated Receipt Item', sku: 'AUDIT-RECEIPT-1',
      itemClass: 'Consumables', subcategory: 'Refrigerant', category: 'Consumables',
      brand: 'Fabricated', type: 'Single', unit: 'units', available: 0,
      reorderLevel: 1, maxStockLevel: 20, location: 'Central Warehouse',
      binLocation: 'Consumables Storage', supplierId: supplier._id,
    });
    const authorization = await ReceiptAuthorization.create({
      authorizationNumber: 'AUDIT-AUTH-RECEIPT-1', nonPoReason: 'LOCAL_PURCHASE',
      explanation: 'Fabricated integration receipt', inventoryId: item._id,
      supplierId: supplier._id, supplierName: supplier.name,
      authorizedQuantity: 7, unitCost: 10,
      sourceDocumentNumber: 'AUDIT-AUTH-SOURCE-1',
      requestedById: user._id, requestedByName: user.fullName, status: 'approved',
    });
    const receipt = (event, source, overrides) => service.receiveInventory({
      receiptMode: 'NON_PO', receiptAuthorizationId: authorization._id,
      location: 'Central Warehouse', binLocation: 'Receiving & Inspection',
      sourceDocumentNumber: source, receiptEventId: event,
      ...overrides,
    }, user);

    await receipt('audit-good-1', 'DN-GOOD-1', { quantity: 2, condition: 'Good' });
    let storedItem = await Inventory.findById(item._id).lean();
    assert.equal(storedItem.available, 2);

    const damaged = await receipt('audit-damaged-1', 'DN-DAMAGED-1', {
      quantity: 2, condition: 'Damaged', acceptedQuantity: 0, damagedQuantity: 2, missingQuantity: 0,
    });
    storedItem = await Inventory.findById(item._id).lean();
    assert.equal(storedItem.available, 2);
    assert.equal(damaged.procurement.acceptedQuantity, 0);
    assert.equal(damaged.procurement.disputedTotalCost, 20);
    assert.equal(damaged.discrepancy.outstandingQuantity, 2);
    assert.equal(damaged.quarantine.quantity, 2);

    const incomplete = await receipt('audit-incomplete-1', 'DN-INCOMPLETE-1', {
      quantity: 3, condition: 'Incomplete', acceptedQuantity: 1, damagedQuantity: 0, missingQuantity: 2,
    });
    storedItem = await Inventory.findById(item._id).lean();
    assert.equal(storedItem.available, 3);
    assert.equal(incomplete.discrepancy.missingQuantity, 2);

    const incompleteReplacement = await receipt('audit-replacement-1', 'DN-REPLACEMENT-1', {
      quantity: 2, condition: 'Good', acceptedQuantity: 2, damagedQuantity: 0, missingQuantity: 0,
      discrepancyId: incomplete.discrepancy.discrepancyId,
    });
    assert.equal(incompleteReplacement.discrepancy.status, 'resolved');

    const damagedReplacement = await receipt('audit-replacement-2', 'DN-REPLACEMENT-2', {
      quantity: 2, condition: 'Good', acceptedQuantity: 2, damagedQuantity: 0, missingQuantity: 0,
      discrepancyId: damaged.discrepancy.discrepancyId,
    });
    assert.equal(damagedReplacement.discrepancy.status, 'resolved');

    const [finalItem, finalAuthorization] = await Promise.all([
      Inventory.findById(item._id).lean(), ReceiptAuthorization.findById(authorization._id).lean(),
    ]);
    assert.equal(finalItem.available, 7);
    assert.equal(finalAuthorization.receivedQuantity, 7);
    assert.equal(finalAuthorization.status, 'completed');
    assert.equal(await Procurement.countDocuments(), 5);
    assert.equal(await ReceiptDiscrepancy.countDocuments({ status: 'resolved' }), 2);
    assert.equal(await QuarantineItem.countDocuments({ source: 'receipt', status: 'quarantined' }), 1);
    assert.equal(await Activity.countDocuments({ type: 'grn' }), 5);

    const rollbackAuthorization = await ReceiptAuthorization.create({
      authorizationNumber: 'AUDIT-AUTH-ROLLBACK-1', nonPoReason: 'LOCAL_PURCHASE',
      explanation: 'Fabricated transaction rollback receipt', inventoryId: item._id,
      supplierId: supplier._id, supplierName: supplier.name,
      authorizedQuantity: 1, unitCost: 10,
      sourceDocumentNumber: 'AUDIT-AUTH-ROLLBACK-SOURCE-1',
      requestedById: user._id, requestedByName: user.fullName, status: 'approved',
    });
    const rollbackCounts = await Promise.all([
      Procurement.countDocuments(), ReceiptDiscrepancy.countDocuments(),
      QuarantineItem.countDocuments(), Activity.countDocuments(),
    ]);
    const originalActivityCreate = Activity.create;
    Activity.create = async () => { throw new Error('Injected Activity failure'); };
    try {
      await assert.rejects(() => service.receiveInventory({
        receiptMode: 'NON_PO', receiptAuthorizationId: rollbackAuthorization._id,
        location: 'Central Warehouse', binLocation: 'Receiving & Inspection',
        sourceDocumentNumber: 'DN-ROLLBACK-1', receiptEventId: 'audit-rollback-1',
        quantity: 1, condition: 'Damaged', acceptedQuantity: 0, damagedQuantity: 1, missingQuantity: 0,
      }, user), /Injected Activity failure/);
    } finally {
      Activity.create = originalActivityCreate;
    }
    const [itemAfterRollback, authorizationAfterRollback] = await Promise.all([
      Inventory.findById(item._id).lean(), ReceiptAuthorization.findById(rollbackAuthorization._id).lean(),
    ]);
    assert.equal(itemAfterRollback.available, 7);
    assert.equal(authorizationAfterRollback.receivedQuantity, 0);
    assert.equal(authorizationAfterRollback.status, 'approved');
    assert.deepEqual(await Promise.all([
      Procurement.countDocuments(), ReceiptDiscrepancy.countDocuments(),
      QuarantineItem.countDocuments(), Activity.countDocuments(),
    ]), rollbackCounts);

    const countsBeforeInvalid = await Promise.all([
      Procurement.countDocuments(), ReceiptDiscrepancy.countDocuments(), QuarantineItem.countDocuments(),
    ]);
    await assert.rejects(() => receipt('audit-invalid-1', 'DN-INVALID-1', {
      quantity: 2, condition: 'Incomplete', acceptedQuantity: 1, damagedQuantity: 0, missingQuantity: 0,
    }), (error) => error.code === 'INVALID_RECEIPT_BREAKDOWN');
    assert.deepEqual(await Promise.all([
      Procurement.countDocuments(), ReceiptDiscrepancy.countDocuments(), QuarantineItem.countDocuments(),
    ]), countsBeforeInvalid);

    const order = await PurchaseRequest.create({
      requestId: 'AUDIT-PO-REQUEST-1', poNumber: 'AUDIT-PO-1', status: 'ordered',
      supplierId: supplier._id, supplierName: supplier.name, requestedBy: user.fullName,
      requestedById: user._id, totalEstimate: 30,
      items: [{
        lineId: 'audit-po-line-1', inventoryId: item._id, name: item.name, sku: item.sku,
        itemClass: item.itemClass, subcategory: item.subcategory, unit: item.unit,
        supplierId: supplier._id, quantity: 3, orderedQuantity: 3, receivedQuantity: 0,
        unitCost: 10, estimatedTotal: 30,
      }],
    });
    const poReceipt = (event, source, overrides) => service.receiveInventory({
      receiptMode: 'PO', orderRequestId: order._id, orderLineId: 'audit-po-line-1',
      location: 'Central Warehouse', binLocation: 'Receiving & Inspection',
      sourceDocumentNumber: source, receiptEventId: event,
      ...overrides,
    }, user);
    const poIncomplete = await poReceipt('audit-po-incomplete-1', 'DN-PO-INCOMPLETE-1', {
      quantity: 3, condition: 'Incomplete', acceptedQuantity: 1, damagedQuantity: 0, missingQuantity: 2,
    });
    let storedOrder = await PurchaseRequest.findById(order._id).lean();
    assert.equal(storedOrder.items[0].receivedQuantity, 1);
    assert.equal(storedOrder.status, 'partially-received');
    assert.equal(poIncomplete.discrepancy.outstandingQuantity, 2);

    await poReceipt('audit-po-replacement-1', 'DN-PO-REPLACEMENT-1', {
      quantity: 2, condition: 'Good', acceptedQuantity: 2, damagedQuantity: 0, missingQuantity: 0,
      discrepancyId: poIncomplete.discrepancy.discrepancyId,
    });
    storedOrder = await PurchaseRequest.findById(order._id).lean();
    assert.equal(storedOrder.items[0].receivedQuantity, 3);
    assert.equal(storedOrder.status, 'received');
    assert.equal((await Inventory.findById(item._id).lean()).available, 10);
  } finally {
    if (mongoose.connection.readyState === 1) await resetAuditDatabase();
    await mongoose.disconnect();
  }
});
