const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const DispatchOrder = require('../../src/models/DispatchOrder');
const Activity = require('../../src/models/Activity');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');
const controller = require('../../src/modules/inventory-manager/inventory_manager.controller');

function mockOrder(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    orderId: 'ORD-AUTH-1',
    status: 'to-pack',
    statusVersion: 0,
    items: [{ sku: 'SKU-1', name: 'Item 1', qty: 1, confirmed: true }],
    ...overrides,
  };
}

// dispatch.service.js:updateOrder is the only inventory-manager service that
// used to skip the module's assertRole(user, ['INVENTORY']) defense-in-depth
// check that every other service applies. These tests lock in the fix.
describe('Dispatch authorization (updateOrder)', () => {
  let originalFindOne;
  let originalFindOneAndUpdate;
  let originalActivityCreate;

  beforeEach(() => {
    originalFindOne = DispatchOrder.findOne;
    originalFindOneAndUpdate = DispatchOrder.findOneAndUpdate;
    originalActivityCreate = Activity.create;
  });

  afterEach(() => {
    DispatchOrder.findOne = originalFindOne;
    DispatchOrder.findOneAndUpdate = originalFindOneAndUpdate;
    Activity.create = originalActivityCreate;
  });

  it('rejects a non-INVENTORY user before touching the database', async () => {
    let findOneCalled = false;
    DispatchOrder.findOne = () => {
      findOneCalled = true;
      return { session: () => ({ lean: async () => mockOrder() }) };
    };

    await assert.rejects(
      service.updateOrder('ORD-AUTH-1', { status: 'ready', statusVersion: 0 }, { role: 'CUSTOMER' }),
      (error) => error.statusCode === 403 && error.code === 'FORBIDDEN_WORKFLOW_ACTION',
    );
    assert.equal(findOneCalled, false, 'updateOrder must reject before reading the order');
  });

  it('rejects a request with no authenticated user', async () => {
    await assert.rejects(
      service.updateOrder('ORD-AUTH-1', { status: 'ready', statusVersion: 0 }, undefined),
      (error) => error.statusCode === 403 && error.code === 'FORBIDDEN_WORKFLOW_ACTION',
    );
  });

  it('allows an INVENTORY user and stamps the actor into the transition Activity', async () => {
    const order = mockOrder();
    DispatchOrder.findOne = () => ({
      session: () => ({ lean: async () => order }),
    });
    DispatchOrder.findOneAndUpdate = async (filter, update) => ({ ...order, ...update.$set, statusVersion: 1 });
    let recordedActivity;
    Activity.create = async (docs) => {
      recordedActivity = docs[0];
      return docs;
    };

    const updated = await service.updateOrder(
      'ORD-AUTH-1',
      { status: 'ready', courier: 'Courier', trackId: 'TRK-1', statusVersion: 0 },
      { role: 'INVENTORY', fullName: 'Ivy Inventory' },
    );

    assert.equal(updated.status, 'ready');
    assert.ok(recordedActivity, 'a transition Activity must be recorded');
    assert.match(recordedActivity.description, /Ivy Inventory/);
  });

  it('SUPER_ADMIN is also allowed, matching the router-level authorize() gate', async () => {
    const order = mockOrder();
    DispatchOrder.findOne = () => ({ session: () => ({ lean: async () => order }) });
    DispatchOrder.findOneAndUpdate = async (filter, update) => ({ ...order, ...update.$set, statusVersion: 1 });
    Activity.create = async (docs) => docs;

    await assert.doesNotReject(
      service.updateOrder(
        'ORD-AUTH-1',
        { status: 'ready', courier: 'Courier', trackId: 'TRK-1', statusVersion: 0 },
        { role: 'SUPER_ADMIN', fullName: 'Root' },
      ),
    );
  });

  it('the controller forwards req.user to the service', async () => {
    let capturedUser = 'not-called';
    const originalUpdateOrder = service.updateOrder;
    service.updateOrder = async (id, data, user) => {
      capturedUser = user;
      return { orderId: id };
    };
    try {
      const req = { params: { id: 'ORD-AUTH-1' }, body: { status: 'ready' }, user: { role: 'INVENTORY', fullName: 'Ivy' } };
      const res = { json() {}, status() { return this; } };
      await controller.updateOrder(req, res);
      assert.deepEqual(capturedUser, { role: 'INVENTORY', fullName: 'Ivy' });
    } finally {
      service.updateOrder = originalUpdateOrder;
    }
  });
});
