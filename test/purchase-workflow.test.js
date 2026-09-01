const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvalMode,
  canonicalPurchaseStatus,
  outstandingQuantity,
  fulfillmentStatus,
  purchaseRequestWorkflowStages,
  receiptAuthorizationWorkflowStages,
  summarizeProcurementWorkflow,
} = require('../src/utils/purchase-workflow');

test('legacy pending approval is projected into the Manager stage', () => {
  assert.equal(canonicalPurchaseStatus('pending-approval'), 'pending-manager');
  assert.equal(canonicalPurchaseStatus('approved'), 'approved');
});

test('outstanding quantity and fulfillment status honor partial receipts', () => {
  const lines = [
    { orderedQuantity: 5, receivedQuantity: 2 },
    { quantity: 3, receivedQuantity: 3 },
  ];
  assert.equal(outstandingQuantity(lines[0]), 3);
  assert.equal(fulfillmentStatus(lines), 'partially-received');
  lines[0].receivedQuantity = 5;
  assert.equal(fulfillmentStatus(lines), 'received');
});

test('approval mode defaults safely to manager-first', () => {
  const previous = process.env.PURCHASE_APPROVAL_MODE;
  delete process.env.PURCHASE_APPROVAL_MODE;
  assert.equal(approvalMode(), 'manager-first');
  process.env.PURCHASE_APPROVAL_MODE = 'two-stage';
  assert.equal(approvalMode(), 'two-stage');
  if (previous === undefined) delete process.env.PURCHASE_APPROVAL_MODE;
  else process.env.PURCHASE_APPROVAL_MODE = previous;
});

test('purchase requests map to one explicit workflow stage', () => {
  const inventoryIds = new Set(['inventory-1']);
  const fixtures = [
    ['pending-approval', ['awaiting-manager']],
    ['pending-manager', ['awaiting-manager']],
    ['pending-finance', ['awaiting-finance-approval']],
    ['approved', ['ready-to-issue']],
    ['ordered', ['ready-to-receive']],
    ['partially-received', ['ready-to-receive']],
    ['received', []],
    ['rejected', []],
    ['cancelled', []],
  ];
  for (const [status, expected] of fixtures) {
    const request = {
      status,
      items: [{ inventoryId: 'inventory-1', orderedQuantity: 5, receivedQuantity: status === 'partially-received' ? 2 : 0 }],
    };
    assert.deepEqual(purchaseRequestWorkflowStages(request, inventoryIds), expected, status);
  }
  assert.deepEqual(purchaseRequestWorkflowStages({
    status: 'ordered', items: [{ inventoryId: 'inventory-1', orderedQuantity: 5, receivedQuantity: 5 }],
  }, inventoryIds), []);
});

test('receipt authorizations can require receiving and reconciliation concurrently', () => {
  const stages = receiptAuthorizationWorkflowStages({
    status: 'partially-received',
    inventoryId: 'inventory-1',
    authorizedQuantity: 10,
    receivedQuantity: 4,
    financeReviewStatus: 'pending',
  }, new Set(['inventory-1']));
  assert.deepEqual(stages, ['ready-to-receive', 'awaiting-receipt-reconciliation']);
});

test('receipt authorization statuses map to explicit workflow stages', () => {
  const inventoryIds = new Set(['inventory-1']);
  const fixtures = [
    [{ status: 'pending', receivedQuantity: 0, financeReviewStatus: 'pending' }, ['awaiting-manager']],
    [{ status: 'approved', receivedQuantity: 0, financeReviewStatus: 'pending' }, ['ready-to-receive']],
    [{ status: 'partially-received', receivedQuantity: 2, financeReviewStatus: 'reconciled' }, ['ready-to-receive']],
    [{ status: 'completed', receivedQuantity: 5, financeReviewStatus: 'pending' }, ['awaiting-receipt-reconciliation']],
    [{ status: 'completed', receivedQuantity: 5, financeReviewStatus: 'not-required' }, []],
    [{ status: 'rejected', receivedQuantity: 0, financeReviewStatus: 'pending' }, []],
  ];
  for (const [overrides, expected] of fixtures) {
    const authorization = {
      inventoryId: 'inventory-1', authorizedQuantity: 5, receivedQuantity: 0,
      financeReviewStatus: 'pending', ...overrides,
    };
    assert.deepEqual(receiptAuthorizationWorkflowStages(authorization, inventoryIds), expected, overrides.status);
  }
});

test('new-item authorizations remain receivable without an inventory id', () => {
  assert.deepEqual(receiptAuthorizationWorkflowStages({
    status: 'approved',
    newItemSnapshot: { name: 'Fabricated test item', sku: 'TEST-001' },
    authorizedQuantity: 2,
    receivedQuantity: 0,
    financeReviewStatus: 'pending',
  }, new Set()), ['ready-to-receive']);
});

test('workflow summary keeps Finance approval separate from receipt reconciliation', () => {
  const summary = summarizeProcurementWorkflow([
    { status: 'pending-manager', items: [] },
    { status: 'pending-finance', items: [] },
    { status: 'approved', items: [] },
    { status: 'ordered', items: [{ inventoryId: 'inventory-1', quantity: 3, receivedQuantity: 0 }] },
  ], [
    { status: 'pending', authorizedQuantity: 2, receivedQuantity: 0, financeReviewStatus: 'pending' },
    { status: 'partially-received', inventoryId: 'inventory-1', authorizedQuantity: 5, receivedQuantity: 2, financeReviewStatus: 'pending' },
  ], { inventoryIds: new Set(['inventory-1']) });

  assert.deepEqual(summary, {
    awaitingManager: 2,
    awaitingFinanceApproval: 1,
    readyToIssue: 1,
    readyToReceive: 2,
    awaitingReceiptReconciliation: 1,
    breakdown: {
      awaitingManager: { purchaseRequests: 1, receiptAuthorizations: 1 },
      readyToReceive: { purchaseOrders: 1, receiptAuthorizations: 1 },
    },
    awaitingReceipt: 2,
    awaitingFinance: 1,
  });
});
