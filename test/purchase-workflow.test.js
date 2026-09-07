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
const {
  normalizeReceiptDisposition,
  nextDiscrepancyState,
  receiptProgress,
} = require('../src/modules/inventory-manager/receipt-disposition');
const {
  assertPurchaseStatusVersion,
  savePurchaseRequest,
} = require('../src/utils/purchase-request-concurrency');

test('legacy pending approval is projected into the Manager stage', () => {
  assert.equal(canonicalPurchaseStatus('pending-approval'), 'pending-manager');
  assert.equal(canonicalPurchaseStatus('PENDING'), 'pending-finance');
  assert.equal(canonicalPurchaseStatus('APPROVED'), 'approved');
  assert.equal(canonicalPurchaseStatus('REJECTED'), 'rejected');
  assert.equal(canonicalPurchaseStatus('approved'), 'approved');
});

test('purchase mutations require an exact statusVersion and normalize save races', async () => {
  assert.doesNotThrow(() => assertPurchaseStatusVersion({ statusVersion: 4 }, 4));
  for (const supplied of [undefined, null, '', 3, 5, 4.5]) {
    assert.throws(
      () => assertPurchaseStatusVersion({ statusVersion: 4 }, supplied),
      (error) => error.statusCode === 409 && error.code === 'STALE_ORDER_REQUEST',
    );
  }

  await assert.rejects(
    () => savePurchaseRequest({
      async save() {
        const error = new Error('No matching version');
        error.name = 'VersionError';
        throw error;
      },
    }),
    (error) => error.statusCode === 409 && error.code === 'STALE_ORDER_REQUEST',
  );
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

test('legacy good and damaged receipts map to safe explicit allocations', () => {
  assert.deepEqual(normalizeReceiptDisposition({ quantity: 3, condition: 'Good' }), {
    quantity: 3, acceptedQuantity: 3, damagedQuantity: 0, missingQuantity: 0, condition: 'Good',
  });
  assert.deepEqual(normalizeReceiptDisposition({ quantity: 2, condition: 'Damaged' }), {
    quantity: 2, acceptedQuantity: 0, damagedQuantity: 2, missingQuantity: 0, condition: 'Damaged',
  });
});

test('incomplete receipts require and preserve accepted and missing quantities', () => {
  assert.throws(
    () => normalizeReceiptDisposition({ quantity: 5, condition: 'Incomplete' }),
    (error) => error.code === 'RECEIPT_BREAKDOWN_REQUIRED' && error.statusCode === 400,
  );
  assert.deepEqual(normalizeReceiptDisposition({
    quantity: 5, condition: 'Incomplete', acceptedQuantity: 3, damagedQuantity: 0, missingQuantity: 2,
  }), {
    quantity: 5, acceptedQuantity: 3, damagedQuantity: 0, missingQuantity: 2, condition: 'Incomplete',
  });
});

test('receipt allocations reject invalid totals, values, and condition drift', () => {
  assert.throws(
    () => normalizeReceiptDisposition({ quantity: 5, acceptedQuantity: 4, damagedQuantity: 0, missingQuantity: 0 }),
    (error) => error.code === 'INVALID_RECEIPT_BREAKDOWN',
  );
  assert.throws(
    () => normalizeReceiptDisposition({ quantity: 1, acceptedQuantity: 0.5, damagedQuantity: 0, missingQuantity: 0.5 }),
    (error) => error.code === 'INVALID_RECEIPT_BREAKDOWN',
  );
  assert.throws(
    () => normalizeReceiptDisposition({ quantity: 2, condition: 'Good', acceptedQuantity: 1, damagedQuantity: 1, missingQuantity: 0 }),
    (error) => error.code === 'RECEIPT_CONDITION_MISMATCH',
  );
});

test('only accepted units advance receipt workflow fulfillment', () => {
  assert.deepEqual(receiptProgress({ orderedQuantity: 10, receivedQuantity: 2 }, 3), {
    receivedQuantity: 5, outstandingQuantity: 5, status: 'partially-received',
  });
  assert.deepEqual(receiptProgress({ orderedQuantity: 10, receivedQuantity: 2 }, 0), {
    receivedQuantity: 2, outstandingQuantity: 8, status: 'partially-received',
  });
  assert.deepEqual(receiptProgress({ orderedQuantity: 10, receivedQuantity: 8 }, 2), {
    receivedQuantity: 10, outstandingQuantity: 0, status: 'completed',
  });
});

test('replacement receipts reduce discrepancies only by accepted units', () => {
  assert.deepEqual(nextDiscrepancyState({ outstandingQuantity: 4, resolvedQuantity: 0 }, {
    quantity: 3, acceptedQuantity: 2, damagedQuantity: 0, missingQuantity: 1,
  }), { outstandingQuantity: 2, resolvedQuantity: 2, status: 'replacement-pending' });
  assert.deepEqual(nextDiscrepancyState({ outstandingQuantity: 2, resolvedQuantity: 2 }, {
    quantity: 2, acceptedQuantity: 2, damagedQuantity: 0, missingQuantity: 0,
  }), { outstandingQuantity: 0, resolvedQuantity: 4, status: 'resolved' });
  assert.throws(
    () => nextDiscrepancyState({ outstandingQuantity: 2, resolvedQuantity: 0 }, {
      quantity: 3, acceptedQuantity: 3, damagedQuantity: 0, missingQuantity: 0,
    }),
    (error) => error.code === 'REPLACEMENT_EXCEEDS_DISCREPANCY',
  );
});
