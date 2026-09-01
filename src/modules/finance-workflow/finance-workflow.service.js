const mongoose = require('mongoose');
const PurchaseRequest = require('../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const Procurement = require('../../models/Procurement');
const Activity = require('../../models/Activity');
const {
  canonicalPurchaseStatus,
  purchaseRequestWorkflowStages,
  receiptAuthorizationWorkflowStages,
} = require('../../utils/purchase-workflow');
require('../../models/Inventory');
require('../../models/Supplier');

function serviceError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function assertFinance(user) {
  if (!user || user.role !== 'FINANCE') throw serviceError(403, 'Finance role is required', 'FINANCE_REQUIRED');
}

function commentOf(input) {
  const comment = String(input.comment || input.reason || '').trim();
  if (!comment) throw serviceError(400, 'A decision comment is required', 'COMMENT_REQUIRED');
  return comment;
}

function assertVersion(record, value) {
  if (!Number.isInteger(Number(value)) || Number(value) !== Number(record.statusVersion || 0)) {
    throw serviceError(409, 'This record changed after it was opened; refresh before deciding', 'STALE_DECISION');
  }
}

exports.listPurchaseRequests = async (user, filters = {}) => {
  assertFinance(user);
  const query = { status: filters.status || 'pending-finance' };
  if (filters.status === 'all') delete query.status;
  const requests = await PurchaseRequest.find(query).sort({ createdAt: 1 }).lean();
  return requests.map((request) => ({
    ...request,
    status: canonicalPurchaseStatus(request.status),
    workflowStages: purchaseRequestWorkflowStages(request),
  }));
};

exports.decidePurchaseRequest = async (id, input, user) => {
  assertFinance(user);
  if (!mongoose.isValidObjectId(id)) throw serviceError(400, 'Invalid purchase request ID', 'INVALID_ID');
  if (!['approved', 'rejected'].includes(input.decision)) throw serviceError(400, 'Invalid decision', 'INVALID_DECISION');
  const comment = commentOf(input);
  const request = await PurchaseRequest.findById(id);
  if (!request) throw serviceError(404, 'Purchase request not found', 'ORDER_NOT_FOUND');
  if (request.status !== 'pending-finance') throw serviceError(409, 'Request is not awaiting Finance', 'INVALID_ORDER_TRANSITION');
  if (String(request.requestedById || '') === String(user._id)) throw serviceError(403, 'Self-approval is not allowed', 'SELF_APPROVAL');
  assertVersion(request, input.statusVersion);
  const now = new Date();
  request.financialApproval = {
    status: input.decision, actorId: user._id, actorName: user.fullName, comment, decidedAt: now,
  };
  request.decisionHistory.push({
    stage: 'finance', decision: input.decision, actorId: user._id, actorName: user.fullName, comment, at: now,
  });
  request.status = input.decision === 'approved' ? 'approved' : 'rejected';
  if (input.decision === 'rejected') {
    request.rejectionReason = comment;
    request.rejectedAt = now;
  }
  request.statusVersion += 1;
  await request.save();
  await Activity.create({
    type: input.decision === 'approved' ? 'request' : 'alert',
    title: `Finance ${input.decision === 'approved' ? 'Approved' : 'Rejected'} Purchase Request`,
    description: `${request.requestId}: ${comment}`, actionLabel: 'View Request',
  });
  return request.toObject();
};

exports.listNonPoReceipts = async (user, filters = {}) => {
  assertFinance(user);
  const query = { financeReviewStatus: filters.status || 'pending', receivedQuantity: { $gt: 0 } };
  if (filters.status === 'all') delete query.financeReviewStatus;
  const authorizations = await ReceiptAuthorization.find(query)
    .populate('inventoryId', 'name sku')
    .populate('supplierId', 'name')
    .sort({ updatedAt: 1 })
    .lean();
  return authorizations.map((authorization) => ({
    ...authorization,
    workflowStages: receiptAuthorizationWorkflowStages(authorization),
  }));
};

exports.reconcileNonPoReceipt = async (id, input, user) => {
  assertFinance(user);
  if (!mongoose.isValidObjectId(id)) throw serviceError(400, 'Invalid authorization ID', 'INVALID_ID');
  if (!['reconciled', 'rejected'].includes(input.decision)) throw serviceError(400, 'Invalid reconciliation decision', 'INVALID_DECISION');
  const comment = commentOf(input);
  const authorization = await ReceiptAuthorization.findById(id);
  if (!authorization) throw serviceError(404, 'Receipt authorization not found', 'AUTHORIZATION_NOT_FOUND');
  if (authorization.financeReviewStatus !== 'pending' || authorization.receivedQuantity <= 0) {
    throw serviceError(409, 'This receipt is not awaiting Finance reconciliation', 'INVALID_RECONCILIATION_TRANSITION');
  }
  assertVersion(authorization, input.statusVersion);
  if (!(await Procurement.exists({ receiptAuthorizationId: authorization._id, receiptMode: 'NON_PO' }))) {
    throw serviceError(409, 'No posted receipt exists for this authorization', 'RECEIPT_NOT_POSTED');
  }
  authorization.financeReviewStatus = input.decision;
  authorization.financeReviewedAt = new Date();
  authorization.financeReviewedById = user._id;
  authorization.financeReference = String(input.financeReference || '').trim();
  authorization.financeComment = comment;
  authorization.statusVersion += 1;
  await authorization.save();
  await Activity.create({
    type: input.decision === 'reconciled' ? 'request' : 'alert',
    title: `Non-PO Receipt ${input.decision === 'reconciled' ? 'Reconciled' : 'Rejected by Finance'}`,
    description: `${authorization.authorizationNumber}: ${comment}`, actionLabel: 'View Authorization',
  });
  return authorization.toObject();
};
