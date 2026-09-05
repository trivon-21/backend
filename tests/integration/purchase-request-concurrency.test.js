const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const inventoryService = require('../../src/modules/inventory-manager/inventory_manager.service');
const managerService = require('../../src/modules/manager/manager.orders.service');
const financeService = require('../../src/modules/finance-workflow/finance-workflow.service');
const User = require('../../src/models/User');
const Supplier = require('../../src/models/Supplier');
const Inventory = require('../../src/models/Inventory');
const PurchaseRequest = require('../../src/models/PurchaseRequest');
const Activity = require('../../src/models/Activity');

const uri = process.env.INVENTORY_AUDIT_MONGO_URI;

async function resetAuditDatabase() {
  if (mongoose.connection.name !== 'airlux_inventory_audit') {
    throw new Error(`Refusing to reset unexpected database ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();
}

async function competing(first, second) {
  const settled = await Promise.allSettled([first(), second()]);
  const successes = settled.filter((result) => result.status === 'fulfilled');
  const failures = settled.filter((result) => result.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason.statusCode, 409);
  assert.equal(failures[0].reason.code, 'STALE_ORDER_REQUEST');
  return successes[0].value;
}

test('competing purchase edits and transitions allow one statusVersion winner', {
  skip: !uri,
}, async () => {
  const originalMode = process.env.PURCHASE_APPROVAL_MODE;
  await mongoose.connect(uri);
  try {
    await resetAuditDatabase();
    await Promise.all([
      User.init(), Supplier.init(), Inventory.init(), PurchaseRequest.init(), Activity.init(),
    ]);
    const [requester, manager, finance] = await User.create([
      { fullName: 'Concurrency Inventory', role: 'INVENTORY' },
      { fullName: 'Concurrency Manager', role: 'MANAGER' },
      { fullName: 'Concurrency Finance', role: 'FINANCE' },
    ]);
    const supplier = await Supplier.create({ name: 'Concurrency Supplier' });
    const inventory = await Inventory.create({
      name: 'Concurrency Item',
      sku: 'CONCURRENCY-ITEM-1',
      itemClass: 'Consumables',
      subcategory: 'Refrigerant',
      category: 'Consumables',
      brand: 'Fabricated',
      type: 'Single',
      unit: 'units',
      available: 0,
      reorderLevel: 1,
      maxStockLevel: 20,
      location: 'Central Warehouse',
      binLocation: 'Consumables Storage',
      supplierId: supplier._id,
    });
    let sequence = 0;
    const makeRequest = async (status) => {
      sequence += 1;
      return PurchaseRequest.create({
        requestId: `CONCURRENCY-REQ-${sequence}`,
        supplierId: supplier._id,
        supplierName: supplier.name,
        requestedBy: requester.fullName,
        requestedById: requester._id,
        status,
        statusVersion: 0,
        totalEstimate: 10,
        items: [{
          lineId: `line-${sequence}`,
          inventoryId: inventory._id,
          name: inventory.name,
          sku: inventory.sku,
          itemClass: inventory.itemClass,
          subcategory: inventory.subcategory,
          unit: inventory.unit,
          supplierId: supplier._id,
          quantity: 1,
          orderedQuantity: 1,
          receivedQuantity: 0,
          unitCost: 10,
          estimatedTotal: 10,
        }],
      });
    };

    const editable = await makeRequest('draft');
    await assert.rejects(
      () => inventoryService.updateOrderRequest(
        editable.requestId,
        { notes: 'Missing version' },
        requester,
      ),
      (error) => error.code === 'STALE_ORDER_REQUEST',
    );
    await competing(
      () => inventoryService.updateOrderRequest(
        editable.requestId,
        { notes: 'Competing edit A', statusVersion: 0 },
        requester,
      ),
      () => inventoryService.updateOrderRequest(
        editable.requestId,
        { notes: 'Competing edit B', statusVersion: 0 },
        requester,
      ),
    );
    assert.equal((await PurchaseRequest.findById(editable._id).lean()).statusVersion, 1);

    const submittable = await makeRequest('draft');
    await competing(
      () => inventoryService.submitOrderRequest(
        submittable.requestId,
        { statusVersion: 0 },
        requester,
      ),
      () => inventoryService.submitOrderRequest(
        submittable.requestId,
        { statusVersion: 0 },
        requester,
      ),
    );
    const submitted = await PurchaseRequest.findById(submittable._id).lean();
    assert.equal(submitted.status, 'pending-manager');
    assert.equal(submitted.statusVersion, 1);

    delete process.env.PURCHASE_APPROVAL_MODE;
    const managerPending = await makeRequest('pending-manager');
    await competing(
      () => managerService.decideOrder(
        managerPending._id,
        { decision: 'approved', comment: 'Approve once', statusVersion: 0 },
        manager,
      ),
      () => managerService.decideOrder(
        managerPending._id,
        { decision: 'rejected', comment: 'Reject stale', statusVersion: 0 },
        manager,
      ),
    );
    const managerStored = await PurchaseRequest.findById(managerPending._id).lean();
    assert.ok(['approved', 'rejected'].includes(managerStored.status));
    assert.equal(managerStored.statusVersion, 1);

    const financePending = await makeRequest('pending-finance');
    await competing(
      () => financeService.decidePurchaseRequest(
        financePending._id,
        { decision: 'approved', comment: 'Finance approve once', statusVersion: 0 },
        finance,
      ),
      () => financeService.decidePurchaseRequest(
        financePending._id,
        { decision: 'rejected', comment: 'Finance reject stale', statusVersion: 0 },
        finance,
      ),
    );
    const financeStored = await PurchaseRequest.findById(financePending._id).lean();
    assert.ok(['approved', 'rejected'].includes(financeStored.status));
    assert.equal(financeStored.statusVersion, 1);

    const issuable = await makeRequest('approved');
    await competing(
      () => inventoryService.issuePurchaseOrder(
        issuable.requestId,
        { statusVersion: 0 },
        requester,
      ),
      () => inventoryService.issuePurchaseOrder(
        issuable.requestId,
        { statusVersion: 0 },
        requester,
      ),
    );
    const issued = await PurchaseRequest.findById(issuable._id).lean();
    assert.equal(issued.status, 'ordered');
    assert.equal(issued.statusVersion, 1);
    assert.match(issued.poNumber, /^PO-/);

    assert.equal(await Activity.countDocuments({ title: 'Purchase Request Submitted' }), 1);
    assert.equal(await Activity.countDocuments({ title: 'Purchase Order Issued' }), 1);
  } finally {
    if (originalMode === undefined) delete process.env.PURCHASE_APPROVAL_MODE;
    else process.env.PURCHASE_APPROVAL_MODE = originalMode;
    if (mongoose.connection.readyState === 1) await resetAuditDatabase();
    await mongoose.disconnect();
  }
});
