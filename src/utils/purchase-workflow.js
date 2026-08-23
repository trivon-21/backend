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

module.exports = {
  PURCHASE_STATUSES,
  LEGACY_PURCHASE_STATUSES,
  ACTIVE_INCOMING_STATUSES,
  NON_PO_REASONS,
  approvalMode,
  canonicalPurchaseStatus,
  outstandingQuantity,
  fulfillmentStatus,
};
