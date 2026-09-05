const User = require('../../models/User');
const financeWorkflow = require('../finance-workflow/finance-workflow.service');
const { createLog } = require('./auditLog.controller');
const {
  sendPurchaseApprovalEmail,
  sendPurchaseRejectionEmail,
} = require('../shared/notification/email.service');

function sendError(res, error, fallbackMessage) {
  res.status(error.statusCode || 500).json({
    code: error.code,
    message: error.statusCode ? error.message : fallbackMessage,
  });
}

function normalizeLegacyRequest(request) {
  const value = request?.toObject ? request.toObject() : request;
  return {
    ...value,
    totalAmount: value.totalAmount || value.totalEstimate || 0,
    items: (value.items || []).map((item) => ({
      ...item,
      itemName: item.itemName || item.name || '',
      unitPrice: item.unitPrice ?? item.unitCost ?? 0,
      total: item.total ?? item.estimatedTotal ?? 0,
    })),
  };
}

async function resolveRequesterEmail(request) {
  if (request.requestedByEmail) return request.requestedByEmail;
  if (!request.requestedById) return '';
  const user = await User.findById(request.requestedById).select('email').lean();
  return user?.email || '';
}

async function legacyList(req, res, status) {
  try {
    const requests = await financeWorkflow.listPurchaseRequests(req.user, { status });
    res.json(await Promise.all(requests.map(async (request) => ({
      ...normalizeLegacyRequest(request),
      requestedByEmail: await resolveRequesterEmail(request),
    }))));
  } catch (error) {
    sendError(res, error, 'Failed to fetch purchase requests');
  }
}

async function recordLegacyDecision(request, decision, requesterEmail, comment) {
  const requestRef = request.requestId
    || `PR-${String(request._id).slice(-6).toUpperCase()}`;
  const performedBy = request.financialApproval?.actorName || request.approvedBy;
  await createLog({
    eventType: decision === 'approved'
      ? 'PURCHASE_REQUEST_APPROVED'
      : 'PURCHASE_REQUEST_REJECTED',
    paymentType: 'PURCHASE_REQUEST',
    orderId: requestRef,
    customerName: request.requestedBy || 'Inventory Manager',
    customerEmail: requesterEmail,
    amount: request.totalAmount || request.totalEstimate || 0,
    rejectionReason: decision === 'rejected' ? comment : undefined,
    performedBy,
    notes: request.reason || request.notes || '',
  });

  if (!requesterEmail) return;
  if (decision === 'approved') {
    await sendPurchaseApprovalEmail(
      requesterEmail,
      request.requestedBy || 'Inventory Manager',
      requestRef,
      request.totalAmount || request.totalEstimate || 0,
    );
  } else {
    await sendPurchaseRejectionEmail(
      requesterEmail,
      request.requestedBy || 'Inventory Manager',
      requestRef,
      comment,
    );
  }
}

async function legacyDecision(req, res, decision) {
  const rejectionReason = String(req.body?.rejectionReason || '').trim();
  const comment = String(
    req.body?.comment
      || req.body?.reason
      || rejectionReason
      || (decision === 'approved' ? 'Approved through legacy Finance endpoint' : ''),
  ).trim();
  try {
    const request = await financeWorkflow.decidePurchaseRequest(
      req.params.id,
      { decision, comment, statusVersion: req.body?.statusVersion },
      req.user,
    );
    const requesterEmail = await resolveRequesterEmail(request);
    await recordLegacyDecision(request, decision, requesterEmail, comment);
    res.json({
      message: `Purchase request ${decision}`,
      request: {
        ...normalizeLegacyRequest(request),
        requestedByEmail: requesterEmail,
      },
    });
  } catch (error) {
    sendError(
      res,
      error,
      decision === 'approved' ? 'Approval failed' : 'Rejection failed',
    );
  }
}

exports.getPendingRequests = (req, res) => legacyList(req, res, 'pending-finance');
exports.getApprovedRequests = (req, res) => legacyList(req, res, 'approved');
exports.getRejectedRequests = (req, res) => legacyList(req, res, 'rejected');
exports.approveRequest = (req, res) => legacyDecision(req, res, 'approved');
exports.rejectRequest = (req, res) => legacyDecision(req, res, 'rejected');
