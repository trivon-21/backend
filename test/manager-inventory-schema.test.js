const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const LegacyInventory = require('../src/modules/shared/L_inventories.model');
const LegacyPurchaseRequest = require('../src/modules/shared/L_purchaseRequest.model');
const LegacyServiceTicket = require('../src/modules/shared/serviceTicket/serviceTicket.model');
const LegacyInspectionTicket = require('../src/modules/shared/inspection/inspectionTicket.model');
const LegacyInstallation = require('../src/modules/shared/installation/installation.model');
const AssetLoan = require('../src/models/AssetLoan');
const WarehousePickRequest = require('../src/models/WarehousePickRequest');
const DispatchOrder = require('../src/models/DispatchOrder');
const Inventory = require('../src/models/Inventory');
const ServiceTicket = require('../src/models/ServiceTicket');
const InspectionTicket = require('../src/models/InspectionTicket');
const Installation = require('../src/models/Installation');
const PurchaseRequest = require('../src/models/PurchaseRequest');
const Procurement = require('../src/models/Procurement');
const ReceiptAuthorization = require('../src/models/ReceiptAuthorization');
const Order = require('../src/models/Order');
const configCache = require('../src/utils/config-cache');
const paymentJob = require('../src/jobs/paymentAutoCancelJob');
const { preparePurchaseUpdate, findDuplicateShortageKeys, migrate, APPLY_TOKEN: PURCHASE_TOKEN } = require('../scripts/migrate-purchasing-workflow');
const { prepareOrderOwnerUpdate, migrateOrderCompatibility, APPLY_TOKEN: ORDER_TOKEN } = require('../scripts/migrate-order-compatibility');
const { countDownstreamReferences, inventoryTotals, recomputeTeamCounts, resetWorkflow, APPLY_TOKEN: RESET_TOKEN } = require('../scripts/reset-material-workflow');
const { indexNeedsReplacement, matchingIndex, reconcileIndexes, APPLY_TOKEN: INDEX_TOKEN } = require('../scripts/reconcile-manager-inventory-indexes');
const { bsonType, renderMarkdown: renderSchemaMarkdown, summarizeFields } = require('../scripts/export-schema-snapshot');
const auditScope = require('../scripts/manager-inventory-audit-scope');
const {
  buildAudit,
  extractDeclaredRoutes,
  flattenSchema,
  routeCoverage,
  indexCompatible,
  typeCompatible,
} = require('../scripts/audit-schema-snapshot');

const objectId = () => new mongoose.Types.ObjectId();

test('purchase lines reject fractional and over-received quantities', async () => {
  const request = new PurchaseRequest({
    requestId: 'REQ-SCHEMA-1', supplierName: 'Supplier', requestedBy: 'Inventory Manager',
    items: [{ name: 'Capacitor', sku: 'CAP-1', quantity: 2, orderedQuantity: 2, receivedQuantity: 3 }],
  });
  const error = await request.validate().catch((validationError) => validationError);
  assert.match(error.errors['items.0.receivedQuantity'].message, /cannot exceed ordered quantity/i);

  request.items[0].receivedQuantity = 0;
  request.items[0].quantity = 1.5;
  const fractionalError = await request.validate().catch((validationError) => validationError);
  assert.match(fractionalError.errors['items.0.quantity'].message, /validator failed/i);
});

test('receipt schemas require the reference appropriate to their mode', async () => {
  const poReceipt = new Procurement({
    receiptMode: 'PO', supplierName: 'Supplier', itemName: 'Capacitor', sku: 'CAP-1',
    quantity: 1, unit: 'units', receivedBy: 'Inventory Manager',
  });
  const poError = await poReceipt.validate().catch((validationError) => validationError);
  assert.match(poError.errors.orderRequestId.message, /require an order request/i);

  const nonPoReceipt = new Procurement({
    receiptMode: 'NON_PO', nonPoReason: 'LOCAL_PURCHASE', supplierName: 'Supplier',
    itemName: 'Capacitor', sku: 'CAP-1', quantity: 1, unit: 'units', receivedBy: 'Inventory Manager',
  });
  const nonPoError = await nonPoReceipt.validate().catch((validationError) => validationError);
  assert.match(nonPoError.errors.receiptAuthorizationId.message, /require an approved authorization/i);
});

test('receipt authorizations reject missing item sources and excess receipts', async () => {
  const authorization = new ReceiptAuthorization({
    authorizationNumber: 'NPO-SCHEMA-1', nonPoReason: 'LOCAL_PURCHASE', explanation: 'Urgent repair',
    supplierId: objectId(), supplierName: 'Supplier', authorizedQuantity: 2, receivedQuantity: 3,
    sourceDocumentNumber: 'DOC-1', requestedById: objectId(), requestedByName: 'Inventory Manager',
  });
  const error = await authorization.validate().catch((validationError) => validationError);
  assert.match(error.errors.inventoryId.message, /inventory item or new-item snapshot/i);
  assert.match(error.errors.receivedQuantity.message, /cannot exceed authorized quantity/i);
});

test('tool loans retain a legacy technician ID while validating the canonical User reference', () => {
  const loan = new AssetLoan({
    toolId: objectId(), toolName: 'Vacuum Pump', assetTag: 'TOOL-1', technicianId: 'legacy-free-text-id',
    technicianUserId: 'invalid-user-reference', technicianName: 'Technician', dueDate: new Date(Date.now() + 86400000),
  });
  assert.ok(loan.validateSync().errors.technicianUserId);
  assert.equal(loan.technicianId, 'legacy-free-text-id');
});

test('dispatch and material request item quantities are positive whole numbers', () => {
  const dispatch = new DispatchOrder({
    orderId: 'ORD-SCHEMA-1', customer: 'Customer', date: '2026-08-15', type: 'Delivery',
    items: [{ name: 'Filter', sku: 'FILTER-1', qty: 0 }],
  });
  const material = new WarehousePickRequest({
    requestId: 'MAT-SCHEMA-1', requester: 'Technician', date: '2026-08-15', location: 'Job',
    items: [{ name: 'Filter', sku: 'FILTER-1', qty: 1.5 }],
  });
  assert.ok(dispatch.validateSync().errors['items.0.qty']);
  assert.ok(material.validateSync().errors['items.0.qty']);
});

test('ticket resolution timestamps follow the ticket status', async () => {
  const ticket = new ServiceTicket({
    customerId: objectId(), requestType: 'Repair', description: 'No cooling', status: 'resolved',
  });
  await ticket.validate();
  assert.ok(ticket.resolvedAt instanceof Date);

  ticket.status = 'open';
  await ticket.validate();
  assert.equal(ticket.resolvedAt, undefined);
});

test('adapted models use the shared collection names', () => {
  assert.equal(Inventory.collection.collectionName, 'inventory');
  assert.equal(DispatchOrder.collection.collectionName, 'dispatch_orders');
  assert.equal(WarehousePickRequest.collection.collectionName, 'warehouse_pick_requests');
  assert.equal(PurchaseRequest.collection.collectionName, 'purchase_requests');
  assert.equal(ServiceTicket.collection.collectionName, 'service_tickets');
  assert.equal(InspectionTicket.collection.collectionName, 'inspection_tickets');
  assert.equal(Installation.collection.collectionName, 'installations');
});

test('incoming schemas remain isolated from current-system model registrations', () => {
  assert.notEqual(Inventory.modelName, LegacyInventory.modelName);
  assert.notEqual(PurchaseRequest.modelName, LegacyPurchaseRequest.modelName);
  assert.notEqual(ServiceTicket.modelName, LegacyServiceTicket.modelName);
  assert.equal(InspectionTicket, LegacyInspectionTicket);
  assert.notEqual(Installation.modelName, LegacyInstallation.modelName);

  assert.equal(Inventory.modelName, 'ManagerInventoryItem');
  assert.equal(PurchaseRequest.modelName, 'ManagerInventoryPurchaseRequest');
  assert.equal(ServiceTicket.modelName, 'ManagerServiceTicket');
  assert.equal(InspectionTicket.modelName, 'InspectionTicket');
  assert.equal(Installation.modelName, 'ManagerInstallation');

  assert.ok(Inventory.schema.path('itemClass'));
  assert.ok(PurchaseRequest.schema.path('operationalApproval.status'));
  assert.ok(ServiceTicket.schema.path('resolvedAt'));
});

function fakeModel(key, collection, fields, risk = 'standard') {
  return {
    key,
    modelName: key,
    collection,
    risk,
    fields: fields.map((field) => ({
      expectedTypes: ['string'], elementTypes: [], required: false, refs: [], models: [key], ...field,
    })),
    indexes: [],
  };
}

function fakeScope(overrides = {}) {
  return {
    modelDefinitions: {},
    endpoints: [],
    collectionUsage: {},
    frontendFields: [],
    classificationOverrides: {},
    namingCandidates: [],
    excludedCollections: [],
    routeSources: {},
    ...overrides,
  };
}

test('snapshot audit detects empty alternate bindings and runtime collections absent from the report', () => {
  const scope = fakeScope({
    endpoints: [
      { role: 'manager', method: 'GET', route: '/work', feature: 'Work', uiReachable: true, handler: 'list', models: ['Bound', 'Missing'] },
    ],
    collectionUsage: { empty_items: { read: ['name'] }, missing_items: { read: ['name'] } },
    namingCandidates: [
      { left: 'empty_items', right: 'canonical_items', inScope: true, relation: 'confirmed-alternate-binding' },
    ],
  });
  const models = {
    Bound: fakeModel('Bound', 'empty_items', [{ field: 'name', required: true }], 'high'),
    Missing: fakeModel('Missing', 'missing_items', [{ field: 'name', required: true }]),
  };
  const report = {
    database: 'fabricated',
    collections: [
      { name: 'empty_items', totalDocuments: 0, documentsScanned: 0, fields: [], indexes: [] },
      { name: 'canonical_items', totalDocuments: 2, documentsScanned: 2, fields: [{ field: 'name', types: ['string'], presentPct: 100, sample: 'Synthetic' }], indexes: [] },
    ],
  };

  const audit = buildAudit(report, scope, models);
  assert.equal(audit.incorrectBindings.length, 1);
  assert.equal(audit.incorrectBindings[0].collection, 'empty_items');
  assert.deepEqual(audit.usedButUnreported.map((entry) => entry.collection), ['missing_items']);
  assert.equal(JSON.stringify(audit).includes('Synthetic'), false);
});

test('snapshot audit classifies nested fields, BSON number types, empty arrays, and frontend-only fields', () => {
  const scope = fakeScope({
    endpoints: [{ role: 'inventory', method: 'GET', route: '/things', feature: 'Things', uiReachable: true, handler: 'list', models: ['Thing'] }],
    collectionUsage: { things: { read: ['items[].qty', 'optionalCode'] } },
    frontendFields: [
      { collection: 'things', field: 'displayTime', classification: 'presentation-only', note: 'Synthetic UI field.' },
    ],
  });
  const models = {
    Thing: fakeModel('Thing', 'things', [
      { field: 'items', expectedTypes: ['array'] },
      { field: 'items[].qty', expectedTypes: ['number'], required: true },
      { field: 'history', expectedTypes: ['array'] },
      { field: 'history[].event', expectedTypes: ['string'], required: true },
      { field: 'ownerId', expectedTypes: ['objectId'], refs: ['User'] },
      { field: 'optionalCode', expectedTypes: ['string'] },
    ]),
  };
  models.Thing.indexes = [{ name: null, key: { optionalCode: 1 }, unique: false, sparse: false, expireAfterSeconds: null }];
  const report = {
    collections: [{
      name: 'things', totalDocuments: 1, documentsScanned: 1, indexes: [],
      fields: [
        { field: 'items', types: ['array'], presentPct: 100, sample: '[1 item(s)]' },
        { field: 'items[].qty', types: ['int'], presentPct: 100, sample: 2 },
        { field: 'history', types: ['array'], presentPct: 100, sample: '[0 item(s)]' },
        { field: 'ownerId', types: ['objectId'], presentPct: 100, sample: '000000000000000000000001' },
      ],
    }],
  };

  const audit = buildAudit(report, scope, models);
  const fields = new Map(audit.collections[0].fieldComparisons.map((field) => [field.field, field]));
  assert.equal(fields.get('items[].qty').classification, 'compatible');
  assert.equal(fields.get('history[].event').classification, 'unobserved-empty-array');
  assert.equal(fields.get('optionalCode').classification, 'unobserved-state-dependent');
  assert.deepEqual(audit.collections[0].references, [{
    field: 'ownerId', ref: 'User', targetCollection: null, targetPresentInSnapshot: null,
  }]);
  assert.equal(audit.collections[0].missingIndexes.length, 1);
  assert.equal(audit.frontendFields[0].declaredInModel, false);
  assert.equal(audit.frontendFields[0].observedInSnapshot, false);
  assert.equal(typeCompatible(['number'], ['int', 'double']), true);
  assert.equal(typeCompatible(['objectId'], ['string']), false);
});

test('schema flattener emits nested document-array paths without exposing values', () => {
  const schema = new mongoose.Schema({
    title: { type: String, required: true },
    lines: [{ quantity: { type: Number, required: true }, serial: String }],
  });
  const fields = flattenSchema(schema, 'SyntheticModel');
  assert.equal(fields.get('title').required, true);
  assert.deepEqual(fields.get('lines').expectedTypes, ['array']);
  assert.deepEqual(fields.get('lines[].quantity').expectedTypes, ['number']);
});

test('asset-return route maps to asset_loans and dormant collections stay excluded', () => {
  const report = {
    collections: [{ name: 'asset_loans', totalDocuments: 1, documentsScanned: 1, fields: [], indexes: [] }],
  };
  const scope = fakeScope({
    endpoints: [{ role: 'inventory', method: 'GET', route: '/asset-return-logs', feature: 'Returns', uiReachable: true, handler: 'getAssetReturnLogs', models: ['AssetLoan'] }],
    excludedCollections: [
      { collection: 'asset_return_logs', reason: 'Dormant.' },
      { collection: 'logistics', reason: 'Dormant.' },
      { collection: 'tickets', reason: 'Dormant.' },
    ],
  });
  const models = { AssetLoan: fakeModel('AssetLoan', 'asset_loans', [{ field: 'status' }]) };

  const audit = buildAudit(report, scope, models);
  assert.deepEqual(audit.endpointMatrix[0].collections, ['asset_loans']);
  assert.deepEqual(audit.usedButUnreported, []);
  assert.deepEqual(audit.excludedCollections.map((entry) => entry.collection), ['asset_return_logs', 'logistics', 'tickets']);
});

test('audit scope covers every registered manager and inventory route and excludes notifications', () => {
  const coverage = routeCoverage(auditScope);
  assert.equal(coverage.length, 2);
  assert.ok(coverage.every((entry) => entry.missingFromScope.length === 0));
  assert.ok(coverage.every((entry) => entry.staleScopeEntries.length === 0));
  assert.equal(auditScope.endpoints.length, 58);
  assert.ok(auditScope.endpoints.every((entry) => !['/orders/:orderId/approve', '/orders/:orderId/reject'].includes(entry.route)));
  assert.ok(auditScope.endpoints.every((entry) => !entry.handler.includes('maintenance-notification')));
  assert.ok(Object.values(auditScope.modelDefinitions).every((definition) => ![
    '../src/models/AssetReturnLog', '../src/models/Logistics', '../src/models/Ticket',
  ].includes(definition.module)));
});

test('index comparison does not invent options omitted by the snapshot exporter', () => {
  const expected = {
    key: { email: 1 }, unique: true, sparse: true, expireAfterSeconds: null,
    partialFilterExpression: null,
  };
  const observed = {
    key: { email: 1 }, unique: true, sparse: false, expireAfterSeconds: null,
    partialFilterExpression: null,
    observableOptions: { unique: true, sparse: false, expireAfterSeconds: false, partialFilterExpression: false },
  };
  assert.equal(indexCompatible(expected, observed), true);
  observed.observableOptions.sparse = true;
  assert.equal(indexCompatible(expected, observed), false);
});

test('audit records when current code is newer than the supplied snapshot', () => {
  const scope = fakeScope({ codeReferenceAt: '2026-08-29T00:00:00.000Z' });
  const audit = buildAudit({ generatedAt: '2026-08-22T00:00:00.000Z', collections: [] }, scope, {});
  assert.equal(audit.metadata.codeNewerThanSnapshot, true);
  assert.equal(audit.metadata.snapshotAgeDays, 7);
});

test('route extractor supports all registered HTTP verbs used by the portals', () => {
  const routes = extractDeclaredRoutes(`
    router.get('/one', handler);
    router.post("/two", handler);
    router.put(\`/three\`, handler);
    router.patch('/four/:id', handler);
    router.delete('/five/:id', handler);
  `);
  assert.deepEqual(routes, [
    { method: 'GET', route: '/one' },
    { method: 'POST', route: '/two' },
    { method: 'PUT', route: '/three' },
    { method: 'PATCH', route: '/four/:id' },
    { method: 'DELETE', route: '/five/:id' },
  ]);
});

test('order schema synchronizes canonical and compatibility owners and accepts cancellation', async () => {
  const owner = objectId();
  const fromCustomer = new Order({ customer: owner, orderStatus: 'Cancelled' });
  await fromCustomer.validate();
  assert.equal(fromCustomer.userId, String(owner));

  const fromLegacy = new Order({ userId: String(owner) });
  await fromLegacy.validate();
  assert.equal(String(fromLegacy.customer), String(owner));
  const filter = Order.ownerCompatibilityFilter(owner);
  assert.equal(filter.$or.length, 3);
  assert.ok(filter.$or.some((entry) => entry.$expr));
});

test('payment auto-cancellation validates updates and returns compatibility fallbacks', async (t) => {
  const originalRules = configCache.getBusinessRules;
  const originalFind = Order.find;
  const originalUpdate = Order.findByIdAndUpdate;
  t.after(() => {
    configCache.getBusinessRules = originalRules;
    Order.find = originalFind;
    Order.findByIdAndUpdate = originalUpdate;
  });
  configCache.getBusinessRules = async () => ({ paymentAutoCancelDays: 14 });
  Order.find = async () => [{ _id: 'order-1', orderReference: 'ALX-BO-0001' }];
  let options;
  Order.findByIdAndUpdate = async (_id, _update, suppliedOptions) => {
    options = suppliedOptions;
    return { _id, orderReference: 'ALX-BO-0001', userId: 'legacy-owner', total: 2500 };
  };
  const result = await paymentJob.executePaymentAutoCancelJob();
  assert.equal(options.runValidators, true);
  assert.deepEqual(result.cancelledOrders[0], {
    _id: 'order-1', orderRef: 'ALX-BO-0001', customer: 'legacy-owner', amount: 2500,
  });
});

test('purchasing preparation catches ordered-quantity-only gaps and shortage duplicates', () => {
  const source = objectId();
  const supplier = objectId();
  const prepared = preparePurchaseUpdate({
    status: 'pending-manager', statusVersion: 0, requestedById: objectId(),
    source: 'material-request', sourceMaterialRequestId: source, supplierId: supplier,
    items: [{ lineId: 'line-1', quantity: 3, receivedQuantity: 0 }],
  });
  assert.equal(prepared.changed, true);
  assert.equal(prepared.update.items[0].orderedQuantity, 3);
  assert.equal(prepared.update.activeShortageKey, `${source}:${supplier}`);
  assert.equal(findDuplicateShortageKeys([prepared, prepared]).length, 1);
});

test('all mutating maintenance tools reject apply mode without their confirmation token', async () => {
  await assert.rejects(() => migrate({ apply: true, confirmed: false }), new RegExp(PURCHASE_TOKEN));
  await assert.rejects(() => migrateOrderCompatibility({ apply: true, confirmed: false }), new RegExp(ORDER_TOKEN));
  await assert.rejects(() => resetWorkflow({ db: {}, apply: true, confirmed: false }), new RegExp(RESET_TOKEN));
  await assert.rejects(() => reconcileIndexes({ db: {}, apply: true, confirmed: false }), new RegExp(INDEX_TOKEN));
});

test('order compatibility migration converts raw ObjectIds without losing the canonical owner', () => {
  const owner = objectId();
  assert.deepEqual(prepareOrderOwnerUpdate({ userId: owner }), { userId: String(owner), customer: owner });
  assert.deepEqual(prepareOrderOwnerUpdate({ customer: owner }), { userId: String(owner) });
});

test('material reset stock totals and index replacement checks are deterministic', () => {
  const id = objectId();
  const totals = inventoryTotals([{ _id: id, available: 7, reserved: 3 }]);
  assert.equal(totals.get(String(id)), 10);
  const desired = { key: { poNumber: 1 }, options: { unique: true, partialFilterExpression: { poNumber: { $type: 'string' } } } };
  const current = { name: 'poNumber_1', key: { poNumber: 1 }, unique: true, partialFilterExpression: { poNumber: { $type: 'string' } } };
  assert.equal(matchingIndex([current], desired), current);
  assert.equal(indexNeedsReplacement(current, desired), false);
  assert.equal(indexNeedsReplacement({ ...current, partialFilterExpression: undefined }, desired), true);
});

test('material reset detects downstream references and recomputes affected team workload', async () => {
  const teamId = objectId();
  const updates = [];
  const db = {
    collection(name) {
      if (name === 'purchase_requests') return { countDocuments: async () => 2 };
      if (name === 'leftover_returns') return { countDocuments: async () => 1 };
      if (name === 'repairs') return { find: () => ({ toArray: async () => [{ assignedTeamId: teamId, status: 'In Progress' }] }) };
      if (['installations', 'inspection_tickets', 'maintenances'].includes(name)) return { find: () => ({ toArray: async () => [] }) };
      if (name === 'tech_teams') return { updateOne: async (...args) => updates.push(args) };
      throw new Error(`Unexpected collection ${name}`);
    },
  };
  const dependencies = await countDownstreamReferences(db, [objectId()], [objectId()]);
  assert.deepEqual(dependencies, { purchaseRequests: 2, leftoverReturns: 1, total: 3 });
  await recomputeTeamCounts(db, [teamId], 'fixture-session');
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0][1].$set, { activeJobsCount: 1, status: 'On Job' });
});

test('index reconciliation aborts before writes when duplicate keys exist', async () => {
  let createCalls = 0;
  const collection = {
    listIndexes: () => ({ toArray: async () => [] }),
    aggregate: () => ({ toArray: async () => [{ _id: { ticketRef: 'INS-00001' }, count: 2 }] }),
    createIndex: async () => { createCalls += 1; },
  };
  await assert.rejects(
    () => reconcileIndexes({ db: { collection: () => collection }, logger: { table() {}, log() {} } }),
    /Duplicate values prevent inspection_tickets\.ticketRef_1/,
  );
  assert.equal(createCalls, 0);
});

test('schema snapshot exporter flattens nested arrays without retaining document values', () => {
  const owner = objectId();
  const fields = summarizeFields([
    { _id: owner, customerName: 'Fixture Person', items: [{ sku: 'FIXTURE-1', quantity: 2 }], history: [] },
    { _id: objectId(), customerName: 'Another Fixture', items: [{ sku: 'FIXTURE-2', quantity: 1 }] },
  ]);
  const byName = new Map(fields.map((field) => [field.field, field]));
  assert.deepEqual(byName.get('items[].quantity').types, ['int']);
  assert.equal(byName.get('customerName').presentPct, 100);
  assert.equal(byName.get('history').emptyArray, true);
  assert.equal(bsonType(owner), 'objectId');
  assert.equal(JSON.stringify(fields).includes('Fixture Person'), false);

  const markdown = renderSchemaMarkdown({ database: 'fixture', generatedAt: '2026-08-30T00:00:00.000Z', collections: [{
    name: 'things', totalDocuments: 2, documentsScanned: 2, fields, indexes: [],
  }] });
  assert.match(markdown, /Document values and samples are intentionally excluded/);
  assert.equal(markdown.includes('Another Fixture'), false);
});
