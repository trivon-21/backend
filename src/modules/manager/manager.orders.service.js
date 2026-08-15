const mongoose = require('mongoose');
const OrderRequest = require('../../models/OrderRequest');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const Activity = require('../../models/Activity');
const { approvalMode, canonicalPurchaseStatus } = require('../../utils/purchase-workflow');

function serviceError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function ensureOnline() {
  if (mongoose.connection.readyState !== 1) {
    throw serviceError(503, 'Purchase approvals are unavailable while the database is offline', 'DATABASE_OFFLINE');
  }
}

function assertManager(user) {
  if (!user || user.role !== 'MANAGER') {
    throw serviceError(403, 'Only a Manager can make operational approval decisions', 'MANAGER_REQUIRED');
  }
}

function requireComment(comment) {
  const normalized = String(comment || '').trim();
  if (!normalized) throw serviceError(400, 'An approval or rejection comment is required', 'COMMENT_REQUIRED');
  return normalized;
}

function assertVersion(record, statusVersion) {
  if (!Number.isInteger(Number(statusVersion)) || Number(statusVersion) !== Number(record.statusVersion || 0)) {
    throw serviceError(409, 'This record changed after it was opened; refresh before deciding', 'STALE_DECISION');
  }
}

function summarize(orders) {
  const pending = orders.filter((order) => canonicalPurchaseStatus(order.status) === 'pending-manager');
  return {
    pending: pending.length,
    approved: orders.filter((order) => ['approved', 'ordered', 'partially-received', 'received'].includes(canonicalPurchaseStatus(order.status))).length,
    rejected: orders.filter((order) => canonicalPurchaseStatus(order.status) === 'rejected').length,
    pendingValue: pending.reduce((sum, order) => sum + Number(order.totalEstimate || 0), 0),
  };
}

exports.listOrders = async (filters = {}, user) => {
  ensureOnline();
  assertManager(user);
  const allOrders = await OrderRequest.find({ status: { $ne: 'draft' } }).sort({ createdAt: -1 }).lean();
  const normalized = allOrders.map(order => ({ ...order, status: canonicalPurchaseStatus(order.status) }));
  const orders = filters.status && filters.status !== 'all'
    ? normalized.filter((order) => order.status === filters.status)
    : normalized;
  return { status: 'Operational', summary: summarize(normalized), orders };
};

exports.decideOrder = async (id, input, user) => {
  ensureOnline();
  assertManager(user);
  if (!mongoose.isValidObjectId(id)) throw serviceError(400, 'Invalid purchase request ID', 'INVALID_ID');
  if (!['approved', 'rejected'].includes(input.decision)) {
    throw serviceError(400, 'Decision must be approved or rejected', 'INVALID_DECISION');
  }
  const comment = requireComment(input.comment ?? input.reason);
  const request = await OrderRequest.findById(id);
  if (!request) throw serviceError(404, 'Purchase request not found', 'ORDER_NOT_FOUND');
  if (canonicalPurchaseStatus(request.status) !== 'pending-manager') {
    throw serviceError(409, 'This request is not awaiting Manager approval', 'INVALID_ORDER_TRANSITION');
  }
  if (String(request.requestedById || '') === String(user._id)) {
    throw serviceError(403, 'You cannot approve your own purchase request', 'SELF_APPROVAL');
  }
  assertVersion(request, input.statusVersion);

  const now = new Date();
  request.operationalApproval = {
    status: input.decision,
    actorId: user._id,
    actorName: user.fullName,
    comment,
    decidedAt: now,
  };
  request.decisionHistory.push({
    stage: 'manager', decision: input.decision, actorId: user._id,
    actorName: user.fullName, comment, at: now,
  });
  if (input.decision === 'rejected') {
    request.status = 'rejected';
    request.rejectionReason = comment;
    request.rejectedAt = now;
  } else {
    request.approvedBy = user.fullName;
    request.approvedAt = now;
    if (approvalMode() === 'two-stage') {
      request.status = 'pending-finance';
      request.financialApproval = { status: 'pending' };
    } else {
      request.status = 'approved';
      request.financialApproval = {
        status: 'not-required', actorName: 'Manager-first rollout',
        comment: 'Finance approval is not required in the current rollout mode', decidedAt: now,
      };
    }
  }
  request.statusVersion += 1;
  await request.save();
  await Activity.create({
    type: input.decision === 'approved' ? 'request' : 'alert',
    title: `Purchase Request ${input.decision === 'approved' ? 'Approved' : 'Rejected'}`,
    description: `${request.requestId}: ${comment}`,
    actionLabel: 'View Request',
  });
  return request.toObject();
};

exports.listReceiptAuthorizations = async (filters = {}, user) => {
  ensureOnline();
  assertManager(user);
  const query = {};
  if (filters.status && filters.status !== 'all') query.status = filters.status;
  return ReceiptAuthorization.find(query)
    .populate('inventoryId', 'name sku available reorderLevel maxStockLevel itemClass subcategory brand')
    .populate('supplierId', 'name')
    .sort({ createdAt: -1 })
    .lean();
};

exports.decideReceiptAuthorization = async (id, input, user) => {
  ensureOnline();
  assertManager(user);
  if (!mongoose.isValidObjectId(id)) throw serviceError(400, 'Invalid authorization ID', 'INVALID_ID');
  if (!['approved', 'rejected'].includes(input.decision)) {
    throw serviceError(400, 'Decision must be approved or rejected', 'INVALID_DECISION');
  }
  const comment = requireComment(input.comment ?? input.reason);
  const authorization = await ReceiptAuthorization.findById(id);
  if (!authorization) throw serviceError(404, 'Receipt authorization not found', 'AUTHORIZATION_NOT_FOUND');
  if (authorization.status !== 'pending') {
    throw serviceError(409, 'This authorization is no longer pending', 'INVALID_AUTHORIZATION_TRANSITION');
  }
  if (String(authorization.requestedById) === String(user._id)) {
    throw serviceError(403, 'You cannot approve your own receipt authorization', 'SELF_APPROVAL');
  }
  assertVersion(authorization, input.statusVersion);

  const now = new Date();
  if (input.decision === 'approved') {
    authorization.status = 'approved';
    authorization.approvedById = user._id;
    authorization.approvedByName = user.fullName;
    authorization.approvedAt = now;
    authorization.approvalComment = comment;
  } else {
    authorization.status = 'rejected';
    authorization.rejectedAt = now;
    authorization.rejectionReason = comment;
  }
  authorization.statusVersion += 1;
  await authorization.save();
  await Activity.create({
    type: input.decision === 'approved' ? 'request' : 'alert',
    title: `Non-PO Authorization ${input.decision === 'approved' ? 'Approved' : 'Rejected'}`,
    description: `${authorization.authorizationNumber}: ${comment}`,
    actionLabel: 'View Authorization',
  });
  return authorization.toObject();
};
