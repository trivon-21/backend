const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const managerService = require('../../src/modules/manager/manager.orders.service');
const financeService = require('../../src/modules/finance-workflow/finance-workflow.service');
const legacyController = require('../../src/modules/finance/purchaseRequest.controller');
const { migrate } = require('../../scripts/migrate-purchasing-workflow');
const User = require('../../src/models/User');
const Supplier = require('../../src/models/Supplier');
const Inventory = require('../../src/models/Inventory');
const PurchaseRequest = require('../../src/models/PurchaseRequest');
const ReceiptAuthorization = require('../../src/models/ReceiptAuthorization');
const Procurement = require('../../src/models/Procurement');
const Activity = require('../../src/models/Activity');

const uri = process.env.INVENTORY_AUDIT_MONGO_URI;

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function resetAuditDatabase() {
  if (mongoose.connection.name !== 'airlux_inventory_audit') {
    throw new Error(`Refusing to reset unexpected database ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();
}

function purchaseFixture({ requestId, requester, supplier, status = 'pending-manager' }) {
  return {
    requestId,
    supplierId: supplier._id,
    supplierName: supplier.name,
    requestedBy: requester.fullName,
    requestedById: requester._id,
    status,
    statusVersion: 0,
    totalEstimate: 100,
    items: [{
      lineId: `${requestId}-line`,
      name: 'Fabricated Finance Item',
      sku: `${requestId}-SKU`,
      itemClass: 'Consumables',
      subcategory: 'Refrigerant',
      unit: 'units',
      supplierId: supplier._id,
      quantity: 2,
      orderedQuantity: 2,
      receivedQuantity: 0,
      unitCost: 50,
      estimatedTotal: 100,
    }],
  };
}

test('manager-first, two-stage, legacy adapter, migration dry-run, and receipt reconciliation are canonical', {
  skip: !uri,
}, async () => {
  const originalMode = process.env.PURCHASE_APPROVAL_MODE;
  await mongoose.connect(uri);
  try {
    await resetAuditDatabase();
    await Promise.all([
      User.init(), Supplier.init(), Inventory.init(), PurchaseRequest.init(),
      ReceiptAuthorization.init(), Procurement.init(), Activity.init(),
    ]);
    const [requester, manager, finance, superAdmin] = await User.create([
      { fullName: 'Audit Inventory Requester', role: 'INVENTORY' },
      { fullName: 'Audit Manager', role: 'MANAGER' },
      { fullName: 'Audit Finance', role: 'FINANCE' },
      { fullName: 'Audit Super Admin', role: 'SUPER_ADMIN' },
    ]);
    const supplier = await Supplier.create({ name: 'Fabricated Finance Supplier' });

    delete process.env.PURCHASE_APPROVAL_MODE;
    const managerFirst = await PurchaseRequest.create(purchaseFixture({
      requestId: 'AUDIT-MANAGER-FIRST', requester, supplier,
    }));
    const managerFirstResult = await managerService.decideOrder(
      managerFirst._id,
      { decision: 'approved', comment: 'Operationally approved', statusVersion: 0 },
      manager,
    );
    assert.equal(managerFirstResult.status, 'approved');
    assert.equal(managerFirstResult.financialApproval.status, 'not-required');
    await assert.rejects(
      () => financeService.decidePurchaseRequest(
        managerFirst._id,
        { decision: 'approved', comment: 'Should not be needed', statusVersion: 1 },
        finance,
      ),
      (error) => error.code === 'INVALID_ORDER_TRANSITION',
    );

    process.env.PURCHASE_APPROVAL_MODE = 'two-stage';
    const twoStage = await PurchaseRequest.create(purchaseFixture({
      requestId: 'AUDIT-TWO-STAGE', requester, supplier,
    }));
    const managerDecision = await managerService.decideOrder(
      twoStage._id,
      { decision: 'approved', comment: 'Send to Finance', statusVersion: 0 },
      manager,
    );
    assert.equal(managerDecision.status, 'pending-finance');
    assert.equal(managerDecision.statusVersion, 1);

    const pending = await financeService.listPurchaseRequests(finance, { status: 'pending-finance' });
    assert.deepEqual(pending.map((request) => request.requestId), ['AUDIT-TWO-STAGE']);
    await assert.rejects(
      () => financeService.decidePurchaseRequest(
        twoStage._id,
        { decision: 'approved', comment: 'Stale approval', statusVersion: 0 },
        finance,
      ),
      (error) => error.code === 'STALE_ORDER_REQUEST',
    );
    assert.equal((await PurchaseRequest.findById(twoStage._id).lean()).status, 'pending-finance');

    const financeDecision = await financeService.decidePurchaseRequest(
      twoStage._id,
      { decision: 'approved', comment: 'Budget approved', statusVersion: 1 },
      finance,
    );
    assert.equal(financeDecision.status, 'approved');
    assert.equal(financeDecision.statusVersion, 2);
    assert.equal(financeDecision.financialApproval.actorName, finance.fullName);
    assert.deepEqual(financeDecision.workflowStages, ['ready-to-issue']);

    const selfOwned = await PurchaseRequest.create(purchaseFixture({
      requestId: 'AUDIT-SELF-APPROVAL', requester: finance, supplier, status: 'pending-finance',
    }));
    const activitiesBeforeSelfDecision = await Activity.countDocuments();
    await assert.rejects(
      () => financeService.decidePurchaseRequest(
        selfOwned._id,
        { decision: 'approved', comment: 'Self decision', statusVersion: 0 },
        finance,
      ),
      (error) => error.code === 'SELF_APPROVAL',
    );
    assert.equal((await PurchaseRequest.findById(selfOwned._id).lean()).status, 'pending-finance');
    assert.equal(await Activity.countDocuments(), activitiesBeforeSelfDecision);

    const superAdminRequest = await PurchaseRequest.create(purchaseFixture({
      requestId: 'AUDIT-SUPER-ADMIN', requester, supplier, status: 'pending-finance',
    }));
    const superAdminDecision = await financeService.decidePurchaseRequest(
      superAdminRequest._id,
      { decision: 'rejected', comment: 'Rejected by override', statusVersion: 0 },
      superAdmin,
    );
    assert.equal(superAdminDecision.status, 'rejected');
    assert.equal(superAdminDecision.financialApproval.actorName, superAdmin.fullName);

    const legacyId = new mongoose.Types.ObjectId();
    await PurchaseRequest.collection.insertOne({
      ...purchaseFixture({ requestId: 'AUDIT-LEGACY-UPPERCASE', requester, supplier }),
      _id: legacyId,
      status: 'PENDING',
      decisionHistory: [],
      operationalApproval: { status: 'approved' },
      financialApproval: { status: 'pending' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const legacyPending = await financeService.listPurchaseRequests(finance, { status: 'pending-finance' });
    assert.ok(legacyPending.some((request) => (
      request.requestId === 'AUDIT-LEGACY-UPPERCASE' && request.status === 'pending-finance'
    )));
    const legacyResponse = responseRecorder();
    await legacyController.approveRequest({
      params: { id: String(legacyId) },
      body: { statusVersion: 0 },
      user: finance,
    }, legacyResponse);
    assert.equal(legacyResponse.statusCode, 200);
    assert.equal(legacyResponse.body.request.status, 'approved');
    assert.equal((await PurchaseRequest.findById(legacyId).lean()).status, 'approved');

    const migrationId = new mongoose.Types.ObjectId();
    await PurchaseRequest.collection.insertOne({
      ...purchaseFixture({ requestId: 'AUDIT-MIGRATION-DRY-RUN', requester, supplier }),
      _id: migrationId,
      status: 'REJECTED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const migrationSummary = await migrate({
      apply: false,
      logger: { table() {}, log() {} },
    });
    assert.equal(migrationSummary.mode, 'DRY_RUN');
    assert.ok(migrationSummary.ordersChanged >= 1);
    assert.equal((await PurchaseRequest.collection.findOne({ _id: migrationId })).status, 'REJECTED');

    const inventory = await Inventory.create({
      name: 'Fabricated Reconciliation Item',
      sku: 'AUDIT-RECONCILE-1',
      itemClass: 'Consumables',
      subcategory: 'Refrigerant',
      category: 'Consumables',
      brand: 'Fabricated',
      type: 'Single',
      unit: 'units',
      available: 1,
      reorderLevel: 1,
      maxStockLevel: 10,
      location: 'Central Warehouse',
      binLocation: 'Consumables Storage',
      supplierId: supplier._id,
    });
    const authorization = await ReceiptAuthorization.create({
      authorizationNumber: 'AUDIT-FINANCE-RECONCILE-1',
      nonPoReason: 'LOCAL_PURCHASE',
      explanation: 'Fabricated reconciliation',
      inventoryId: inventory._id,
      supplierId: supplier._id,
      supplierName: supplier.name,
      authorizedQuantity: 1,
      receivedQuantity: 1,
      unitCost: 25,
      sourceDocumentNumber: 'AUDIT-RECONCILE-DOC-1',
      requestedById: requester._id,
      requestedByName: requester.fullName,
      status: 'completed',
      financeReviewStatus: 'pending',
    });
    await Procurement.create({
      inventoryId: inventory._id,
      receiptMode: 'NON_PO',
      receiptAuthorizationId: authorization._id,
      nonPoReason: 'LOCAL_PURCHASE',
      sourceDocumentNumber: 'AUDIT-RECONCILE-DOC-1',
      supplierId: supplier._id,
      supplierName: supplier.name,
      itemName: inventory.name,
      sku: inventory.sku,
      quantity: 1,
      acceptedQuantity: 1,
      damagedQuantity: 0,
      missingQuantity: 0,
      unit: 'units',
      receivedBy: requester.fullName,
    });
    const reconciliation = await financeService.reconcileNonPoReceipt(
      authorization._id,
      {
        decision: 'reconciled',
        comment: 'Receipt matched supporting evidence',
        financeReference: 'FIN-AUDIT-1',
        statusVersion: 0,
      },
      finance,
    );
    assert.equal(reconciliation.financeReviewStatus, 'reconciled');
    assert.equal(String(reconciliation.financeReviewedById), String(finance._id));
    assert.equal(reconciliation.financeReference, 'FIN-AUDIT-1');
    assert.equal(reconciliation.statusVersion, 1);
    assert.deepEqual(reconciliation.workflowStages, []);
  } finally {
    if (originalMode === undefined) delete process.env.PURCHASE_APPROVAL_MODE;
    else process.env.PURCHASE_APPROVAL_MODE = originalMode;
    if (mongoose.connection.readyState === 1) await resetAuditDatabase();
    await mongoose.disconnect();
  }
});
