const PURCHASE_STATUSES = Object.freeze([
  'draft',
  'pending-manager',
  'pending-finance',
  'approved',
  'rejected',
  'ordered',
  'partially-received',
  'received',
  'cancelled',
]);

const LEGACY_PURCHASE_STATUSES = Object.freeze(['pending-approval']);
const ACTIVE_INCOMING_STATUSES = Object.freeze([
  'pending-manager',
  'pending-finance',
  'approved',
  'ordered',
  'partially-received',
]);

const NON_PO_REASONS = Object.freeze([
  'EMERGENCY_REPAIR',
  'LOCAL_PURCHASE',
  'WARRANTY_REPLACEMENT',
  'SUPPLIER_REPLACEMENT',
  'OTHER',
]);

function approvalMode() {
  return process.env.PURCHASE_APPROVAL_MODE === 'two-stage' ? 'two-stage' : 'manager-first';
}

function canonicalPurchaseStatus(status) {
  return status === 'pending-approval' ? 'pending-manager' : status;
}

function outstandingQuantity(line) {
  return Math.max(0, Number(line.orderedQuantity ?? line.quantity ?? 0) - Number(line.receivedQuantity || 0));
}

function fulfillmentStatus(lines) {
  const ordered = lines.reduce((sum, line) => sum + Number(line.orderedQuantity ?? line.quantity ?? 0), 0);
  const received = lines.reduce((sum, line) => sum + Number(line.receivedQuantity || 0), 0);
  if (ordered > 0 && received >= ordered) return 'received';
  if (received > 0) return 'partially-received';
  return 'ordered';
}

function inventoryReference(value) {
  if (!value) return '';
  return String(value._id || value.id || value);
}

function purchaseRequestWorkflowStages(request, inventoryIds) {
  const status = canonicalPurchaseStatus(request.status);
  if (status === 'pending-manager') return ['awaiting-manager'];
  if (status === 'pending-finance') return ['awaiting-finance-approval'];
  if (status === 'approved') return ['ready-to-issue'];
  if (!['ordered', 'partially-received'].includes(status)) return [];

  const receivable = (request.items || []).some((line) => {
    const inventoryId = inventoryReference(line.inventoryId);
    return outstandingQuantity(line) > 0
      && inventoryId
      && (!inventoryIds || inventoryIds.has(inventoryId));
  });
  return receivable ? ['ready-to-receive'] : [];
}

function receiptAuthorizationWorkflowStages(authorization, inventoryIds) {
  const stages = [];
  if (authorization.status === 'pending') stages.push('awaiting-manager');

  const remaining = Math.max(
    0,
    Number(authorization.authorizedQuantity || 0) - Number(authorization.receivedQuantity || 0),
  );
  const inventoryId = inventoryReference(authorization.inventoryId);
  const hasReceivableItem = authorization.newItemSnapshot
    || (inventoryId && (!inventoryIds || inventoryIds.has(inventoryId)));
  if (['approved', 'partially-received'].includes(authorization.status)
    && remaining > 0 && hasReceivableItem) {
    stages.push('ready-to-receive');
  }
  if (Number(authorization.receivedQuantity || 0) > 0
    && authorization.financeReviewStatus === 'pending') {
    stages.push('awaiting-receipt-reconciliation');
  }
  return stages;
}

function summarizeProcurementWorkflow(purchaseRequests, authorizations, options = {}) {
  const inventoryIds = options.inventoryIds;
  const purchaseStages = purchaseRequests.map((request) => (
    purchaseRequestWorkflowStages(request, inventoryIds)
  ));
  const authorizationStages = authorizations.map((authorization) => (
    receiptAuthorizationWorkflowStages(authorization, inventoryIds)
  ));
  const purchaseCount = (stage) => purchaseStages.filter((stages) => stages.includes(stage)).length;
  const authorizationCount = (stage) => authorizationStages.filter((stages) => stages.includes(stage)).length;

  const awaitingManagerPurchaseRequests = purchaseCount('awaiting-manager');
  const awaitingManagerReceiptAuthorizations = authorizationCount('awaiting-manager');
  const readyPurchaseOrders = purchaseCount('ready-to-receive');
  const readyReceiptAuthorizations = authorizationCount('ready-to-receive');
  const readyToReceive = readyPurchaseOrders + readyReceiptAuthorizations;
  const awaitingReceiptReconciliation = authorizationCount('awaiting-receipt-reconciliation');

  return {
    awaitingManager: awaitingManagerPurchaseRequests + awaitingManagerReceiptAuthorizations,
    awaitingFinanceApproval: purchaseCount('awaiting-finance-approval'),
    readyToIssue: purchaseCount('ready-to-issue'),
    readyToReceive,
    awaitingReceiptReconciliation,
    breakdown: {
      awaitingManager: {
        purchaseRequests: awaitingManagerPurchaseRequests,
        receiptAuthorizations: awaitingManagerReceiptAuthorizations,
      },
      readyToReceive: {
        purchaseOrders: readyPurchaseOrders,
        receiptAuthorizations: readyReceiptAuthorizations,
      },
    },
    awaitingReceipt: readyToReceive,
    awaitingFinance: awaitingReceiptReconciliation,
  };
}

module.exports = {
  PURCHASE_STATUSES,
  LEGACY_PURCHASE_STATUSES,
  ACTIVE_INCOMING_STATUSES,
  NON_PO_REASONS,
  approvalMode,
  canonicalPurchaseStatus,
  outstandingQuantity,
  fulfillmentStatus,
  purchaseRequestWorkflowStages,
  receiptAuthorizationWorkflowStages,
  summarizeProcurementWorkflow,
};
