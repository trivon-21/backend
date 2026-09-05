const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');
const User = require('../../src/models/User');
const Supplier = require('../../src/models/Supplier');
const Inventory = require('../../src/models/Inventory');
const ReceiptAuthorization = require('../../src/models/ReceiptAuthorization');
const Procurement = require('../../src/models/Procurement');
const SerializedAsset = require('../../src/models/SerializedAsset');
const AssetLoan = require('../../src/models/AssetLoan');
const RmaCase = require('../../src/models/RmaCase');
const Activity = require('../../src/models/Activity');
const { migrate } = require('../../scripts/migrate-serialized-assets');

const uri = process.env.INVENTORY_AUDIT_MONGO_URI;

async function resetAuditDatabase() {
  if (mongoose.connection.name !== 'airlux_inventory_audit') {
    throw new Error(`Refusing to reset unexpected database ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();
}

test('concurrent receipts cannot register the same normalized serial globally', { skip: !uri }, async () => {
  await mongoose.connect(uri);
  try {
    await resetAuditDatabase();
    await Promise.all([
      User.init(), Supplier.init(), Inventory.init(), ReceiptAuthorization.init(),
      Procurement.init(), SerializedAsset.init(), AssetLoan.init(), RmaCase.init(), Activity.init(),
    ]);
    const user = await User.create({ fullName: 'Registry Audit Inventory', role: 'INVENTORY' });
    const supplier = await Supplier.create({ name: 'Fabricated Registry Supplier' });
    await Inventory.create({
      name: 'Fabricated Legacy Registry Tool', sku: 'REGISTRY-LEGACY-TOOL',
      itemClass: 'Tools and Test Equipment', subcategory: 'Vacuum Pump',
      category: 'Tools and Test Equipment', brand: 'Fabricated', type: 'Single', unit: 'units',
      isSerialized: true, available: 1, reorderLevel: 0, maxStockLevel: 5,
      location: 'Service Warehouse', binLocation: 'Tool Crib', supplierId: supplier._id,
      serialNumbers: [' Legacy-Tag-1 '],
    });
    const migrationSummary = await migrate({
      db: mongoose.connection.db,
      apply: false,
      logger: { table() {}, log() {} },
    });
    assert.equal(migrationSummary.assetsPlanned, 1);
    assert.equal(await SerializedAsset.countDocuments(), 0);
    const items = await Inventory.create([
      {
        name: 'Fabricated Registry Tool A', sku: 'REGISTRY-TOOL-A', itemClass: 'Tools and Test Equipment',
        subcategory: 'Vacuum Pump', category: 'Tools and Test Equipment', brand: 'Fabricated', type: 'Single',
        unit: 'units', isSerialized: true, available: 0, reorderLevel: 0, maxStockLevel: 5,
        location: 'Service Warehouse', binLocation: 'Tool Crib', supplierId: supplier._id,
      },
      {
        name: 'Fabricated Registry Tool B', sku: 'REGISTRY-TOOL-B', itemClass: 'Tools and Test Equipment',
        subcategory: 'Vacuum Pump', category: 'Tools and Test Equipment', brand: 'Fabricated', type: 'Single',
        unit: 'units', isSerialized: true, available: 0, reorderLevel: 0, maxStockLevel: 5,
        location: 'Service Warehouse', binLocation: 'Tool Crib', supplierId: supplier._id,
      },
    ]);
    const authorizations = await ReceiptAuthorization.create(items.map((item, index) => ({
      authorizationNumber: `AUDIT-REGISTRY-AUTH-${index + 1}`, nonPoReason: 'LOCAL_PURCHASE',
      explanation: 'Fabricated concurrent serial receipt', inventoryId: item._id,
      supplierId: supplier._id, supplierName: supplier.name, authorizedQuantity: 1, unitCost: 100,
      sourceDocumentNumber: `AUDIT-REGISTRY-SOURCE-${index + 1}`,
      requestedById: user._id, requestedByName: user.fullName, status: 'approved',
    })));
    const receive = (index, serialNumber) => service.receiveInventory({
      receiptMode: 'NON_PO', receiptAuthorizationId: authorizations[index]._id,
      quantity: 1, acceptedQuantity: 1, damagedQuantity: 0, missingQuantity: 0, condition: 'Good',
      serialNumbers: [serialNumber], damagedSerialNumbers: [],
      location: 'Service Warehouse', binLocation: 'Tool Crib',
      sourceDocumentNumber: `DN-REGISTRY-${index + 1}`, receiptEventId: `registry-event-${index + 1}`,
    }, user);

    const results = await Promise.allSettled([receive(0, ' Global-Tag-1 '), receive(1, 'global-tag-1')]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'DUPLICATE_SERIAL');
    assert.equal(rejected.reason.statusCode, 409);
    assert.equal(await SerializedAsset.countDocuments({ normalizedSerial: 'GLOBAL-TAG-1' }), 1);
    assert.equal(await Procurement.countDocuments(), 1);
    assert.equal(await Activity.countDocuments({ type: 'grn' }), 1);
    const storedItems = await Inventory.find({ _id: { $in: items.map((item) => item._id) } }).lean();
    assert.equal(storedItems.reduce((sum, item) => sum + item.available, 0), 1);

    let asset = await SerializedAsset.findOne({ normalizedSerial: 'GLOBAL-TAG-1' });
    const ownerId = String(asset.inventoryId);
    const projectedOwner = await service.getInventoryItem(ownerId);
    assert.deepEqual(projectedOwner.serialNumbers, [asset.serialNumber]);
    let availableTools = await service.getAvailableTools();
    assert.deepEqual(availableTools.find((tool) => String(tool._id) === ownerId).availableSerialNumbers, [asset.serialNumber]);

    const technician = await User.create({ fullName: 'Registry Audit Technician', role: 'MAIN_TECH' });
    const loan = await service.checkOutTool({
      toolId: ownerId,
      technicianId: technician._id,
      assetTag: ' global-tag-1 ',
      dueDate: new Date(Date.now() + 86400000),
    }, user);
    asset = await SerializedAsset.findById(asset._id);
    assert.equal(asset.status, 'on-loan');
    assert.equal(String(asset.currentLoanId), String(loan._id));
    availableTools = await service.getAvailableTools();
    assert.equal(availableTools.some((tool) => String(tool._id) === ownerId), false);
    await assert.rejects(() => service.checkOutTool({
      toolId: ownerId,
      technicianId: technician._id,
      assetTag: asset.serialNumber,
      dueDate: new Date(Date.now() + 172800000),
    }, user), (error) => error.code === 'ASSET_NOT_AVAILABLE' && error.statusCode === 409);

    await service.returnTool(String(loan._id), user, { condition: 'good' });
    asset = await SerializedAsset.findById(asset._id);
    assert.equal(asset.status, 'available');
    assert.equal(asset.currentLoanId, undefined);

    const secondLoan = await service.checkOutTool({
      toolId: ownerId,
      technicianId: technician._id,
      assetTag: asset.serialNumber,
      dueDate: new Date(Date.now() + 172800000),
    }, user);
    await service.returnTool(String(secondLoan._id), user, { condition: 'good' });
    assert.equal(await AssetLoan.countDocuments({ serializedAssetId: asset._id }), 2);
    assert.equal(await AssetLoan.countDocuments({ status: 'returned', serializedAssetId: asset._id }), 2);

    const rma = await service.createRmaCase({
      serialNumber: 'global-tag-1', faultDescription: 'Fabricated pressure loss',
    }, user);
    asset = await SerializedAsset.findById(asset._id);
    assert.equal(String(rma.serializedAssetId), String(asset._id));
    assert.equal(asset.status, 'rma');
    assert.equal(String(asset.activeRmaCaseId), String(rma._id));
    await service.updateRmaCase(rma.rmaId, { status: 'under-review' }, user);
    await service.updateRmaCase(rma.rmaId, { status: 'resolved', resolution: 'Fabricated repair complete' }, user);
    asset = await SerializedAsset.findById(asset._id);
    assert.equal(asset.status, 'available');
    assert.equal(asset.activeRmaCaseId, undefined);
    assert.deepEqual((await service.getInventoryItem(ownerId)).serialNumbers, [asset.serialNumber]);
  } finally {
    if (mongoose.connection.readyState === 1) await resetAuditDatabase();
    await mongoose.disconnect();
  }
});
