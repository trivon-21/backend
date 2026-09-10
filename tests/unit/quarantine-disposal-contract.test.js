const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const QuarantineItem = require('../../src/models/QuarantineItem');
const Activity = require('../../src/models/Activity');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');
const controller = require('../../src/modules/inventory-manager/inventory_manager.controller');

function createFakeQuarantineItem(overrides = {}) {
  return new QuarantineItem({
    _id: new mongoose.Types.ObjectId(),
    quarantineId: 'QZ-1001',
    itemName: 'Defective Contactor',
    quantity: 3,
    unit: 'units',
    reason: 'Burnt coil contacts',
    location: 'A',
    source: 'manual',
    status: 'quarantined',
    ...overrides,
  });
}

describe('Quarantine Disposal Contract (IM-016)', () => {
  let originalFindOneAndUpdate;
  let originalFindOne;
  let originalActivityCreate;

  beforeEach(() => {
    originalFindOneAndUpdate = QuarantineItem.findOneAndUpdate;
    originalFindOne = QuarantineItem.findOne;
    originalActivityCreate = Activity.create;
  });

  afterEach(() => {
    QuarantineItem.findOneAndUpdate = originalFindOneAndUpdate;
    QuarantineItem.findOne = originalFindOne;
    Activity.create = originalActivityCreate;
  });

  it('atomically disposes an active quarantine item and creates exactly one audit activity', async () => {
    const item = createFakeQuarantineItem();
    let activitySaved = false;
    let savedActivityTitle = null;

    QuarantineItem.findOneAndUpdate = async (filter, update) => {
      if (filter.status === 'quarantined' && (filter.quarantineId === item.quarantineId || filter._id === item._id)) {
        item.status = update.$set.status;
        item.disposedAt = update.$set.disposedAt;
        item.disposedBy = update.$set.disposedBy;
        return item;
      }
      return null;
    };

    Activity.create = async (docs) => {
      activitySaved = true;
      savedActivityTitle = docs[0].title;
      return docs;
    };

    const user = { fullName: 'Jane Doe', role: 'INVENTORY' };
    const result = await service.disposeQuarantineItem(item.quarantineId, user);

    assert.equal(result.status, 'disposed');
    assert.equal(result.disposedBy, 'Jane Doe');
    assert.ok(result.disposedAt instanceof Date);
    assert.equal(activitySaved, true);
    assert.equal(savedActivityTitle, 'Quarantine Item Disposed');
  });

  it('rejects repeated disposal with 409 QUARANTINE_ALREADY_DISPOSED and no activity side effects', async () => {
    const alreadyDisposedItem = createFakeQuarantineItem({
      status: 'disposed',
      disposedAt: new Date('2026-08-01T10:00:00Z'),
      disposedBy: 'Previous Tech',
    });

    let activityCreated = false;
    Activity.create = async () => {
      activityCreated = true;
    };

    // findOneAndUpdate with status: 'quarantined' matches nothing because it's already disposed
    QuarantineItem.findOneAndUpdate = async () => null;
    QuarantineItem.findOne = async () => alreadyDisposedItem;

    const user = { fullName: 'Jane Doe', role: 'INVENTORY' };

    await assert.rejects(
      service.disposeQuarantineItem(alreadyDisposedItem.quarantineId, user),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'QUARANTINE_ALREADY_DISPOSED');
        assert.match(err.message, /already disposed/i);
        return true;
      }
    );

    assert.equal(activityCreated, false, 'No audit activity should be created on 409 conflict');
  });

  it('rejects disposal of unknown quarantine item with 404 QUARANTINE_NOT_FOUND', async () => {
    QuarantineItem.findOneAndUpdate = async () => null;
    QuarantineItem.findOne = async () => null;

    const user = { fullName: 'Jane Doe', role: 'INVENTORY' };

    await assert.rejects(
      service.disposeQuarantineItem('QZ-99999', user),
      (err) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'QUARANTINE_NOT_FOUND');
        assert.match(err.message, /not found/i);
        return true;
      }
    );
  });

  it('rejects unauthorized users with 403 FORBIDDEN_WORKFLOW_ACTION', async () => {
    const user = { fullName: 'Unauthorized Tech', role: 'TECHNICIAN' };

    await assert.rejects(
      service.disposeQuarantineItem('QZ-1001', user),
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN_WORKFLOW_ACTION');
        return true;
      }
    );
  });

  it('controller translates service 404 and 409 errors with structured response', async () => {
    const originalServiceDispose = service.disposeQuarantineItem;

    try {
      // Test 404 through controller
      service.disposeQuarantineItem = async () => {
        const err = new Error('Quarantine item not found');
        err.statusCode = 404;
        err.code = 'QUARANTINE_NOT_FOUND';
        throw err;
      };

      let status404 = null;
      let body404 = null;
      const res404 = {
        status(code) { status404 = code; return this; },
        json(body) { body404 = body; return this; },
      };

      await controller.disposeQuarantineItem({ params: { id: 'QZ-NONEXISTENT' }, user: { role: 'INVENTORY' } }, res404);
      assert.equal(status404, 404);
      assert.equal(body404.code, 'QUARANTINE_NOT_FOUND');

      // Test 409 through controller
      service.disposeQuarantineItem = async () => {
        const err = new Error('Quarantine item is already disposed');
        err.statusCode = 409;
        err.code = 'QUARANTINE_ALREADY_DISPOSED';
        throw err;
      };

      let status409 = null;
      let body409 = null;
      const res409 = {
        status(code) { status409 = code; return this; },
        json(body) { body409 = body; return this; },
      };

      await controller.disposeQuarantineItem({ params: { id: 'QZ-ALREADY' }, user: { role: 'INVENTORY' } }, res409);
      assert.equal(status409, 409);
      assert.equal(body409.code, 'QUARANTINE_ALREADY_DISPOSED');
    } finally {
      service.disposeQuarantineItem = originalServiceDispose;
    }
  });
});
