const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvalMode,
  canonicalPurchaseStatus,
  outstandingQuantity,
  fulfillmentStatus,
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
