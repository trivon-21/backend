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
const {
  assertPurchaseStatusVersion,
  savePurchaseRequest,
} = require('../../utils/purchase-request-concurrency');
require('../../models/Inventory');
require('../../models/Supplier');

function serviceError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function assertFinance(user) {
  if (!user || !['FINANCE', 'SUPER_ADMIN'].includes(user.role)) {
    throw serviceError(403, 'Finance role is required', 'FINANCE_REQUIRED');
  }
}

function actorName(user) {
  const name = [user?.fullName, user?.lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
  return name || String(user?.email || user?._id || 'Authenticated Finance user');
}

function isRequester(request, user) {
  if (request.requestedById && user?._id
    && String(request.requestedById) === String(user._id)) return true;
  const requesterEmail = String(request.requestedByEmail || '').trim().toLowerCase();
  const financeEmail = String(user?.email || '').trim().toLowerCase();
  return Boolean(requesterEmail && financeEmail && requesterEmail === financeEmail);
}

function purchaseStatusesForFilter(status) {
  const aliases = {
    'pending-finance': ['pending-finance', 'PENDING'],
    approved: ['approved', 'APPROVED'],
    rejected: ['rejected', 'REJECTED'],
  };
  if (status === 'all') return null;
  if (!aliases[status]) throw serviceError(400, 'Invalid purchase-request status filter', 'INVALID_STATUS');
  return aliases[status];
}

function purchaseRequestDto(request) {
  const value = request?.toObject ? request.toObject() : request;
  const status = canonicalPurchaseStatus(value.status);
  return {
    ...value,
    status,
    workflowStages: purchaseRequestWorkflowStages({ ...value, status }),
  };
}

function receiptAuthorizationDto(authorization) {
  const value = authorization?.toObject ? authorization.toObject() : authorization;
  return {
    ...value,
    workflowStages: receiptAuthorizationWorkflowStages(value),
  };
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
  const statuses = purchaseStatusesForFilter(filters.status || 'pending-finance');
  const query = statuses ? { status: { $in: statuses } } : {};
  const requests = await PurchaseRequest.find(query).sort({ createdAt: 1 }).lean();
  return requests.map(purchaseRequestDto);
};

exports.decidePurchaseRequest = async (id, input, user) => {
  assertFinance(user);
  if (!mongoose.isValidObjectId(id)) throw serviceError(400, 'Invalid purchase request ID', 'INVALID_ID');
  if (!['approved', 'rejected'].includes(input.decision)) throw serviceError(400, 'Invalid decision', 'INVALID_DECISION');
  const comment = commentOf(input);
  const request = await PurchaseRequest.findById(id);
  if (!request) throw serviceError(404, 'Purchase request not found', 'ORDER_NOT_FOUND');
  if (isRequester(request, user)) throw serviceError(403, 'Self-approval is not allowed', 'SELF_APPROVAL');
  assertPurchaseStatusVersion(request, input.statusVersion);
  if (canonicalPurchaseStatus(request.status) !== 'pending-finance') {
    throw serviceError(409, 'Request is not awaiting Finance', 'INVALID_ORDER_TRANSITION');
  }
  const now = new Date();
  const performedBy = actorName(user);
  request.financialApproval = {
    status: input.decision, actorId: user._id, actorName: performedBy, comment, decidedAt: now,
  };
  request.decisionHistory.push({
    stage: 'finance', decision: input.decision, actorId: user._id, actorName: performedBy, comment, at: now,
  });
  request.status = input.decision === 'approved' ? 'approved' : 'rejected';
  request.approvedBy = input.decision === 'approved' ? performedBy : '';
  request.approvedAt = input.decision === 'approved' ? now : undefined;
  if (input.decision === 'rejected') {
    request.rejectionReason = comment;
    request.rejectedAt = now;
  }
  request.statusVersion += 1;
  await savePurchaseRequest(request);
  await Activity.create({
    type: input.decision === 'approved' ? 'request' : 'alert',
    title: `Finance ${input.decision === 'approved' ? 'Approved' : 'Rejected'} Purchase Request`,
    description: `${request.requestId}: ${comment}`, actionLabel: 'View Request',
  });
  return purchaseRequestDto(request);
};

exports.listNonPoReceipts = async (user, filters = {}) => {
  assertFinance(user);
  const status = filters.status || 'pending';
  if (!['pending', 'reconciled', 'rejected', 'all'].includes(status)) {
    throw serviceError(400, 'Invalid receipt reconciliation status filter', 'INVALID_STATUS');
  }
  const query = { receivedQuantity: { $gt: 0 } };
  if (status !== 'all') query.financeReviewStatus = status;
  const authorizations = await ReceiptAuthorization.find(query)
    .populate('inventoryId', 'name sku')
    .populate('supplierId', 'name')
    .sort({ updatedAt: 1 })
    .lean();
  return authorizations.map(receiptAuthorizationDto);
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
  return receiptAuthorizationDto(authorization);
};

exports.purchaseRequestDto = purchaseRequestDto;
exports.receiptAuthorizationDto = receiptAuthorizationDto;
exports.purchaseStatusesForFilter = purchaseStatusesForFilter;
