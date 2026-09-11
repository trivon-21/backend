const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Inventory = require('../../src/models/Inventory');
const StockMovement = require('../../src/models/StockMovement');
const Activity = require('../../src/models/Activity');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');
const { resolveAdjustment } = require('../../src/modules/inventory-manager/services/stock-adjustment.service');

describe('resolveAdjustment (pure arithmetic)', () => {
  it('SET mode computes the delta from a counted quantity', () => {
    const result = resolveAdjustment({ mode: 'SET', quantity: 24, currentAvailable: 0, reasonCode: 'OPENING_BALANCE' });
    assert.deepEqual(result, { availableDelta: 24, availableAfter: 24 });
  });

  it('SET mode can decrease stock (cycle-count shortage)', () => {
    const result = resolveAdjustment({ mode: 'SET', quantity: 3, currentAvailable: 10, reasonCode: 'CYCLE_COUNT_VARIANCE' });
    assert.deepEqual(result, { availableDelta: -7, availableAfter: 3 });
  });

  it('DELTA mode adds a positive adjustment', () => {
    const result = resolveAdjustment({ mode: 'DELTA', quantity: 5, currentAvailable: 10, reasonCode: 'CYCLE_COUNT_VARIANCE' });
    assert.deepEqual(result, { availableDelta: 5, availableAfter: 15 });
  });

  it('DELTA mode subtracts a negative adjustment (write-off)', () => {
    const result = resolveAdjustment({ mode: 'DELTA', quantity: -4, currentAvailable: 10, reasonCode: 'DAMAGE' });
    assert.deepEqual(result, { availableDelta: -4, availableAfter: 6 });
  });

  it('rejects a result below zero', () => {
    assert.throws(
      () => resolveAdjustment({ mode: 'DELTA', quantity: -20, currentAvailable: 10, reasonCode: 'SHRINKAGE' }),
      (error) => error.statusCode === 409 && error.code === 'NEGATIVE_STOCK_NOT_ALLOWED',
    );
  });

  it('rejects a negative SET quantity', () => {
    assert.throws(
      () => resolveAdjustment({ mode: 'SET', quantity: -1, currentAvailable: 10, reasonCode: 'DATA_CORRECTION' }),
      (error) => error.statusCode === 400 && error.code === 'INVALID_ADJUSTMENT',
    );
  });

  it('rejects a zero DELTA quantity', () => {
    assert.throws(
      () => resolveAdjustment({ mode: 'DELTA', quantity: 0, currentAvailable: 10, reasonCode: 'DATA_CORRECTION' }),
      (error) => error.statusCode === 400 && error.code === 'INVALID_ADJUSTMENT',
    );
  });

  it('rejects a non-integer quantity', () => {
    assert.throws(
      () => resolveAdjustment({ mode: 'DELTA', quantity: 1.5, currentAvailable: 10, reasonCode: 'DATA_CORRECTION' }),
      (error) => error.statusCode === 400 && error.code === 'INVALID_ADJUSTMENT',
    );
  });

  it('rejects an unrecognised reason code', () => {
    assert.throws(
      () => resolveAdjustment({ mode: 'SET', quantity: 5, currentAvailable: 0, reasonCode: 'MADE_UP' }),
      (error) => error.statusCode === 400 && error.code === 'INVALID_ADJUSTMENT_REASON',
    );
  });

  it('boundary: SET to exactly zero is allowed', () => {
    const result = resolveAdjustment({ mode: 'SET', quantity: 0, currentAvailable: 5, reasonCode: 'CYCLE_COUNT_VARIANCE' });
    assert.deepEqual(result, { availableDelta: -5, availableAfter: 0 });
  });
});

describe('adjustStock (stubbed models, no DB)', () => {
  let originalFindById;
  let originalFindOneAndUpdate;
  let originalMovementFindOne;
  let originalMovementCreate;
  let originalActivityCreate;

  const inventoryId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    originalFindById = Inventory.findById;
    originalFindOneAndUpdate = Inventory.findOneAndUpdate;
    originalMovementFindOne = StockMovement.findOne;
    originalMovementCreate = StockMovement.create;
    originalActivityCreate = Activity.create;

    StockMovement.findOne = () => ({ session: async () => null });
  });

  afterEach(() => {
    Inventory.findById = originalFindById;
    Inventory.findOneAndUpdate = originalFindOneAndUpdate;
    StockMovement.findOne = originalMovementFindOne;
    StockMovement.create = originalMovementCreate;
    Activity.create = originalActivityCreate;
  });

  function stubItem(overrides = {}) {
    const item = {
      _id: inventoryId,
      sku: 'SKU-1',
      name: 'Widget',
      available: 0,
      reserved: 0,
      isSerialized: false,
      ...overrides,
    };
    Inventory.findById = () => ({ session: async () => item });
    return item;
  }

  it('rejects a non-INVENTORY user', async () => {
    await assert.rejects(
      service.adjustStock({ inventoryId, mode: 'SET', quantity: 1, reasonCode: 'OPENING_BALANCE', expectedAvailable: 0 }, { role: 'CUSTOMER' }),
      (error) => error.statusCode === 403,
    );
  });

  it('sets an opening balance on a never-received item and writes exactly one movement + one activity', async () => {
    stubItem({ available: 0 });
    Inventory.findOneAndUpdate = async (filter) => ({
      _id: inventoryId, sku: 'SKU-1', name: 'Widget', available: 24, reserved: 0,
    });
    let movementDoc;
    StockMovement.create = async (docs) => { movementDoc = docs[0]; return [{ ...docs[0], _id: new mongoose.Types.ObjectId() }]; };
    let activityDoc;
    Activity.create = async (docs) => { activityDoc = docs[0]; return docs; };

    const result = await service.adjustStock({
      inventoryId, mode: 'SET', quantity: 24, reasonCode: 'OPENING_BALANCE', note: '', expectedAvailable: 0,
    }, { role: 'INVENTORY', fullName: 'Ivy' });

    assert.equal(result.item.available, 24);
    assert.equal(movementDoc.availableDelta, 24);
    assert.equal(movementDoc.movementType, 'ADJUSTMENT');
    assert.equal(movementDoc.sourceType, 'MANUAL');
    assert.equal(activityDoc.type, 'grn');
    assert.match(activityDoc.description, /Ivy/);
  });

  it('requires a note for a reason code that mandates one', async () => {
    stubItem({ available: 10 });
    await assert.rejects(
      service.adjustStock({
        inventoryId, mode: 'DELTA', quantity: -2, reasonCode: 'DAMAGE', note: '', expectedAvailable: 10,
      }, { role: 'INVENTORY' }),
      (error) => error.statusCode === 400 && error.code === 'ADJUSTMENT_NOTE_REQUIRED',
    );
  });

  it('rejects adjustment on a serialized item', async () => {
    stubItem({ available: 5, isSerialized: true });
    await assert.rejects(
      service.adjustStock({
        inventoryId, mode: 'SET', quantity: 8, reasonCode: 'OPENING_BALANCE', expectedAvailable: 5,
      }, { role: 'INVENTORY' }),
      (error) => error.statusCode === 409 && error.code === 'SERIALIZED_ITEM_NOT_ALLOWED',
    );
  });

  it('surfaces STOCK_CHANGED when expectedAvailable is stale', async () => {
    stubItem({ available: 7 });
    Inventory.findOneAndUpdate = async () => null;
    await assert.rejects(
      service.adjustStock({
        inventoryId, mode: 'SET', quantity: 10, reasonCode: 'OPENING_BALANCE', expectedAvailable: 0,
      }, { role: 'INVENTORY' }),
      (error) => error.statusCode === 409 && error.code === 'STOCK_CHANGED',
    );
  });

  it('replays idempotently when the same adjustmentEventId is submitted twice', async () => {
    stubItem({ available: 0 });
    const existingMovement = { movementId: 'SM-EXISTING', availableDelta: 24 };
    StockMovement.findOne = () => ({ session: async () => existingMovement });
    let findOneAndUpdateCalled = false;
    Inventory.findOneAndUpdate = async () => { findOneAndUpdateCalled = true; return null; };

    const result = await service.adjustStock({
      inventoryId, mode: 'SET', quantity: 24, reasonCode: 'OPENING_BALANCE', expectedAvailable: 0,
      adjustmentEventId: 'evt-123',
    }, { role: 'INVENTORY' });

    assert.equal(result.duplicate, true);
    assert.equal(result.movement, existingMovement);
    assert.equal(findOneAndUpdateCalled, false, 'a duplicated event must not re-apply the stock change');
  });

  it('rejects an unknown item', async () => {
    Inventory.findById = () => ({ session: async () => null });
    await assert.rejects(
      service.adjustStock({
        inventoryId, mode: 'SET', quantity: 1, reasonCode: 'OPENING_BALANCE', expectedAvailable: 0,
      }, { role: 'INVENTORY' }),
      (error) => error.statusCode === 404 && error.code === 'ITEM_NOT_FOUND',
    );
  });
});
