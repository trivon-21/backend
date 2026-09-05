const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
const { protect } = require('../src/middleware/protect');
const { authorize } = require('../src/middleware/role.middleware');
require('../src/modules/shared/L_purchaseRequest.model');

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('protected portal APIs reject requests without a bearer token', async () => {
  const response = responseRecorder();
  let nextCalled = false;

  await protect({ headers: {} }, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('manager authorization rejects the inventory role', () => {
  const response = responseRecorder();
  let nextCalled = false;

  authorize(['MANAGER', 'SUPER_ADMIN'])(
    { user: { role: 'INVENTORY' } },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('inventory authorization accepts inventory and super-admin roles', () => {
  for (const role of ['INVENTORY', 'SUPER_ADMIN']) {
    const response = responseRecorder();
    let nextCalled = false;

    authorize(['INVENTORY', 'SUPER_ADMIN'])(
      { user: { role } },
      response,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  }
});

test('manager authorization accepts manager and super-admin roles', () => {
  for (const role of ['MANAGER', 'SUPER_ADMIN']) {
    const response = responseRecorder();
    let nextCalled = false;

    authorize(['MANAGER', 'SUPER_ADMIN'])(
      { user: { role } },
      response,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  }
});

function legacyPurchaseRequestModel() {
  return mongoose.model('L_PurchaseRequest');
}

function fakePurchaseRequest(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    requestId: 'PR-SECURITY-1',
    requestedById: new mongoose.Types.ObjectId(),
    requestedBy: 'Inventory Test User',
    requestedByEmail: 'inventory@example.test',
    status: 'PENDING',
    totalAmount: 250,
    totalEstimate: 250,
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
      return this;
    },
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
}

async function withLegacyFinanceControllerStubs(run) {
  const auditModule = require('../src/modules/finance/auditLog.controller');
  const emailModule = require('../src/modules/shared/notification/email.service');
  const workflowModule = require('../src/modules/finance-workflow/finance-workflow.service');
  const controllerPath = require.resolve('../src/modules/finance/purchaseRequest.controller');
  const original = {
    createLog: auditModule.createLog,
    approvalEmail: emailModule.sendPurchaseApprovalEmail,
    rejectionEmail: emailModule.sendPurchaseRejectionEmail,
    findById: legacyPurchaseRequestModel().findById,
    decidePurchaseRequest: workflowModule.decidePurchaseRequest,
  };
  const effects = { logs: [], approvalEmails: 0, rejectionEmails: 0 };

  auditModule.createLog = async (entry) => effects.logs.push(entry);
  emailModule.sendPurchaseApprovalEmail = async () => { effects.approvalEmails += 1; };
  emailModule.sendPurchaseRejectionEmail = async () => { effects.rejectionEmails += 1; };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);

  try {
    await run({ controller, effects, model: legacyPurchaseRequestModel(), workflowModule });
  } finally {
    legacyPurchaseRequestModel().findById = original.findById;
    auditModule.createLog = original.createLog;
    emailModule.sendPurchaseApprovalEmail = original.approvalEmail;
    emailModule.sendPurchaseRejectionEmail = original.rejectionEmail;
    workflowModule.decidePurchaseRequest = original.decidePurchaseRequest;
    delete require.cache[controllerPath];
  }
}

test('all legacy Finance purchase-request routes require authentication and Finance authorization', async () => {
  const router = require('../src/modules/finance/purchaseRequest.routes');
  const middleware = router.stack.filter((layer) => !layer.route);
  const routes = router.stack.filter((layer) => layer.route);

  assert.equal(middleware[0]?.handle, protect);
  assert.equal(middleware.length, 2);
  assert.deepEqual(
    routes.map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`),
    [
      'GET /pending',
      'GET /approved',
      'GET /rejected',
      'PUT /approve/:id',
      'PUT /reject/:id',
    ],
  );

  const unauthenticatedResponse = responseRecorder();
  let unauthenticatedControllerCalls = 0;
  await middleware[0].handle(
    { headers: {} },
    unauthenticatedResponse,
    () => { unauthenticatedControllerCalls += 1; },
  );
  assert.equal(unauthenticatedResponse.statusCode, 401);
  assert.equal(unauthenticatedControllerCalls, 0);

  const roleGuard = middleware[1].handle;
  for (const role of ['FINANCE', 'SUPER_ADMIN']) {
    let nextCalls = 0;
    roleGuard({ user: { role } }, responseRecorder(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1, `${role} should reach the controller`);
  }

  for (const role of ['INVENTORY', 'MANAGER', 'CUSTOMER']) {
    const response = responseRecorder();
    let controllerCalls = 0;
    roleGuard({ user: { role } }, response, () => { controllerCalls += 1; });
    assert.equal(response.statusCode, 403);
    assert.equal(controllerCalls, 0, `${role} must have no controller side effects`);
  }
});

test('canonical Finance workflow is mounted and role-protected as a complete route group', () => {
  const routeSource = fs.readFileSync(path.join(
    __dirname,
    '../src/routes/index.js',
  ), 'utf8');
  assert.match(routeSource, /router\.use\(['"]\/finance-workflow['"],\s*financeWorkflowRoutes\)/);

  const router = require('../src/modules/finance-workflow/finance-workflow.routes');
  const middleware = router.stack.filter((layer) => !layer.route);
  const routes = router.stack.filter((layer) => layer.route);
  assert.equal(middleware[0]?.handle, protect);
  assert.equal(middleware.length, 2);
  assert.deepEqual(
    routes.map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`),
    [
      'GET /purchase-requests',
      'POST /purchase-requests/:id/decision',
      'GET /non-po-receipts',
      'POST /non-po-receipts/:id/reconcile',
    ],
  );

  const roleGuard = middleware[1].handle;
  for (const role of ['FINANCE', 'SUPER_ADMIN']) {
    let nextCalls = 0;
    roleGuard({ user: { role } }, responseRecorder(), () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
  }
  const denied = responseRecorder();
  let deniedCalls = 0;
  roleGuard({ user: { role: 'MANAGER' } }, denied, () => { deniedCalls += 1; });
  assert.equal(denied.statusCode, 403);
  assert.equal(deniedCalls, 0);
});

for (const action of ['approve', 'reject']) {
  test(`legacy Finance ${action} prevents self-approval without side effects`, async () => {
    await withLegacyFinanceControllerStubs(async ({ controller, effects, model, workflowModule }) => {
      const actorId = new mongoose.Types.ObjectId();
      const request = fakePurchaseRequest({ requestedById: actorId });
      model.findById = async () => request;
      workflowModule.decidePurchaseRequest = async () => {
        const error = new Error('Self-approval is not allowed');
        error.statusCode = 403;
        error.code = 'SELF_APPROVAL';
        throw error;
      };
      const response = responseRecorder();
      const handler = action === 'approve' ? controller.approveRequest : controller.rejectRequest;

      await handler({
        params: { id: String(request._id) },
        body: { rejectionReason: 'Not required for this test' },
        user: { _id: actorId, fullName: 'Finance Test User', role: 'FINANCE' },
      }, response);

      assert.equal(response.statusCode, 403);
      assert.equal(response.body?.code, 'SELF_APPROVAL');
      assert.equal(request.saveCalls, 0);
      assert.deepEqual(effects, { logs: [], approvalEmails: 0, rejectionEmails: 0 });
      assert.equal(request.status, 'PENDING');
    });
  });
}

for (const action of ['approve', 'reject']) {
  test(`legacy Finance ${action} records the authenticated actor and ignores client identity`, async () => {
    await withLegacyFinanceControllerStubs(async ({ controller, effects, model, workflowModule }) => {
      const request = fakePurchaseRequest();
      model.findById = async () => request;
      const response = responseRecorder();
      const handler = action === 'approve' ? controller.approveRequest : controller.rejectRequest;
      let forwarded;
      workflowModule.decidePurchaseRequest = async (id, input, user, options) => {
        forwarded = { id, input, user, options };
        const actorName = `${user.fullName} ${user.lastName}`;
        request.status = input.decision;
        request.reviewedBy = actorName;
        request.approvedBy = input.decision === 'approved' ? actorName : '';
        request.financialApproval = { status: input.decision, actorName };
        request.saveCalls += 1;
        return request;
      };

      await handler({
        params: { id: String(request._id) },
        body: {
          rejectionReason: 'Budget evidence is incomplete',
          statusVersion: 4,
          reviewedBy: 'Forged Client Identity',
          approvedBy: 'Forged Client Identity',
        },
        user: {
          _id: new mongoose.Types.ObjectId(),
          fullName: 'Authenticated',
          lastName: 'Finance Officer',
          role: 'FINANCE',
        },
      }, response);

      assert.equal(response.statusCode, 200);
      assert.equal(request.saveCalls, 1);
      assert.equal(request.reviewedBy, 'Authenticated Finance Officer');
      if (action === 'approve') assert.equal(request.approvedBy, 'Authenticated Finance Officer');
      assert.equal(forwarded.user.fullName, 'Authenticated');
      assert.equal(forwarded.input.decision, action === 'approve' ? 'approved' : 'rejected');
      assert.equal(forwarded.input.statusVersion, 4);
      assert.equal(forwarded.options, undefined);
      assert.equal(forwarded.input.reviewedBy, undefined);
      assert.equal(effects.logs.length, 1);
      assert.equal(effects.logs[0].performedBy, 'Authenticated Finance Officer');
    });
  });
}

test.after(() => mongoose.disconnect());
