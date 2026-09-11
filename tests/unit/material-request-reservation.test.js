const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const WarehousePickRequest = require('../../src/models/WarehousePickRequest');
const Inventory = require('../../src/models/Inventory');
const JobMaterialRequest = require('../../src/models/JobMaterialRequest');
const Activity = require('../../src/models/Activity');
const materialWorkflow = require('../../src/modules/shared/jobMaterialRequest/jobMaterialRequest.service');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');

// These behave end-to-end (role check -> shortage check -> atomic stock
// move -> request/job bookkeeping -> Activity) purely against monkey-patched
// model statics, with no real database. This works because
// reserve/release/handoverMaterialRequest run through runInTransaction
// (src/utils/transaction.js), which falls back to `work(null)` whenever the
// connection is not a replica set (readyState !== 1 here) instead of opening
// a real mongoose transaction.

function pickRequestDoc(overrides = {}) {
  const doc = new WarehousePickRequest({
    _id: new mongoose.Types.ObjectId(),
    requestId: 'WPR-TEST-1',
    sourceMaterialRequestId: new mongoose.Types.ObjectId(),
    jobId: new mongoose.Types.ObjectId(),
    jobType: 'Repair',
    requesterId: new mongoose.Types.ObjectId(),
    requester: 'Test Technician',
    date: '2026-09-10',
    location: 'Warehouse A',
    status: 'pending',
    statusVersion: 0,
    items: [
      { lineId: 'L1', inventoryId: new mongoose.Types.ObjectId(), name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true },
    ],
    ...overrides,
  });
  // Instance-level stub: avoid a real DB write while keeping every other
  // mongoose document behaviour (validation, defaults, path access) intact.
  doc.save = async function stubSave() { return this; };
  return doc;
}

function stubInventoryFind(items) {
  Inventory.find = () => ({
    select: () => ({
      session: async () => items,
    }),
  });
}

// Simulates the atomic guarded findOneAndUpdate against an in-memory stock
// map, honouring the same $gte guards the real query uses.
function stubInventoryFindOneAndUpdate(stockById) {
  Inventory.findOneAndUpdate = async (filter) => {
    const stock = stockById.get(String(filter._id));
    if (!stock) return null;
    if (filter.available && Number(stock.available) < Number(filter.available.$gte)) return null;
    if (filter.reserved && Number(stock.reserved) < Number(filter.reserved.$gte)) return null;
    return stock;
  };
}

describe('Material request reservation lifecycle (stubbed models, no DB)', () => {
  let originalInventoryFind;
  let originalInventoryFindOneAndUpdate;
  let originalWarehouseFindOne;
  let originalJobMaterialRequestUpdateOne;
  let originalJobMaterialRequestFindOne;
  let originalActivityCreate;
  let originalSetJobState;
  let originalModelForJobType;

  beforeEach(() => {
    originalInventoryFind = Inventory.find;
    originalInventoryFindOneAndUpdate = Inventory.findOneAndUpdate;
    originalWarehouseFindOne = WarehousePickRequest.findOne;
    originalJobMaterialRequestUpdateOne = JobMaterialRequest.updateOne;
    originalJobMaterialRequestFindOne = JobMaterialRequest.findOne;
    originalActivityCreate = Activity.create;
    originalSetJobState = materialWorkflow.setJobState;
    originalModelForJobType = materialWorkflow.modelForJobType;

    JobMaterialRequest.updateOne = async () => ({ acknowledged: true });
    Activity.create = async (docs) => docs;
    materialWorkflow.setJobState = async () => {};
    materialWorkflow.modelForJobType = () => ({
      updateOne: async () => ({ acknowledged: true }),
      findById: () => ({ select: () => ({ session: () => ({ lean: async () => null }) }) }),
    });
  });

  afterEach(() => {
    Inventory.find = originalInventoryFind;
    Inventory.findOneAndUpdate = originalInventoryFindOneAndUpdate;
    WarehousePickRequest.findOne = originalWarehouseFindOne;
    JobMaterialRequest.updateOne = originalJobMaterialRequestUpdateOne;
    JobMaterialRequest.findOne = originalJobMaterialRequestFindOne;
    Activity.create = originalActivityCreate;
    materialWorkflow.setJobState = originalSetJobState;
    materialWorkflow.modelForJobType = originalModelForJobType;
  });

  function mockFindRequest(doc) {
    WarehousePickRequest.findOne = () => ({ session: async () => doc });
  }

  it('rejects a non-INVENTORY user', async () => {
    await assert.rejects(
      service.reserveMaterialRequest('WPR-TEST-1', {}, { role: 'CUSTOMER' }),
      (error) => error.statusCode === 403 && error.code === 'FORBIDDEN_WORKFLOW_ACTION',
    );
  });

  it('aggregates duplicate lines before checking shortage, and reserves the aggregated total', async () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      items: [
        { lineId: 'L1', inventoryId, name: 'Widget', qty: 3, sku: 'SKU-1', confirmed: true },
        { lineId: 'L2', inventoryId, name: 'Widget', qty: 3, sku: 'SKU-1', confirmed: true },
      ],
    });
    mockFindRequest(doc);
    stubInventoryFind([{ _id: inventoryId, sku: 'SKU-1', name: 'Widget', available: 4 }]);

    // A naive per-line check (3 <= 4, 3 <= 4) would pass; the aggregated
    // total (6) must not.
    await assert.rejects(
      service.reserveMaterialRequest('WPR-TEST-1', { statusVersion: 0 }, { role: 'INVENTORY' }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.code, 'INSUFFICIENT_STOCK');
        assert.equal(error.details.length, 1);
        assert.equal(error.details[0].required, 6);
        assert.equal(error.details[0].available, 4);
        assert.deepEqual(error.details[0].lineIds, ['L1', 'L2']);
        return true;
      },
    );
  });

  it('reserves a fully-stocked kit exactly once per item and writes the Activity', async () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      items: [{ lineId: 'L1', inventoryId, name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true }],
    });
    mockFindRequest(doc);
    stubInventoryFind([{ _id: inventoryId, sku: 'SKU-1', name: 'Widget', available: 5 }]);
    const stockById = new Map([[String(inventoryId), { available: 5, reserved: 0, reorderLevel: 1 }]]);
    stubInventoryFindOneAndUpdate(stockById);
    let recordedActivity;
    Activity.create = async (docs) => { recordedActivity = docs[0]; return docs; };

    const result = await service.reserveMaterialRequest('WPR-TEST-1', { statusVersion: 0 }, { role: 'INVENTORY', fullName: 'Ivy' });

    assert.equal(result.status, 'reserved');
    assert.equal(result.statusVersion, 1);
    assert.ok(recordedActivity);
    assert.match(recordedActivity.title, /Reserved/);
    assert.match(recordedActivity.description, /Ivy/);
  });

  it('surfaces a lost-race failure with STOCK_CHANGED_DURING_RESERVE, distinct from the pre-check code', async () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      items: [{ lineId: 'L1', inventoryId, name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true }],
    });
    mockFindRequest(doc);
    // The pre-check snapshot says 5 are available...
    stubInventoryFind([{ _id: inventoryId, sku: 'SKU-1', name: 'Widget', available: 5 }]);
    // ...but the atomic guard sees a concurrent reservation already dropped it to 1.
    Inventory.findOneAndUpdate = async () => null;

    await assert.rejects(
      service.reserveMaterialRequest('WPR-TEST-1', { statusVersion: 0 }, { role: 'INVENTORY' }),
      (error) => error.statusCode === 409 && error.code === 'STOCK_CHANGED_DURING_RESERVE',
    );
  });

  it('release moves reserved back to available and now writes an Activity row (previously missing)', async () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      status: 'reserved',
      statusVersion: 1,
      items: [{ lineId: 'L1', inventoryId, name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true }],
    });
    mockFindRequest(doc);
    const stockById = new Map([[String(inventoryId), { available: 3, reserved: 2, reorderLevel: 1 }]]);
    stubInventoryFindOneAndUpdate(stockById);
    let recordedActivity;
    Activity.create = async (docs) => { recordedActivity = docs[0]; return docs; };

    const result = await service.releaseMaterialRequest('WPR-TEST-1', { statusVersion: 1 }, { role: 'INVENTORY', fullName: 'Ivy' });

    assert.equal(result.status, 'pending');
    assert.ok(result.items.every((item) => item.confirmed === false));
    assert.ok(recordedActivity, 'releaseMaterialRequest must record an Activity row');
    assert.match(recordedActivity.title, /Released/);
    assert.match(recordedActivity.description, /Ivy/);
  });

  it('handover only consumes reserved and leaves available untouched', async () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      status: 'reserved',
      statusVersion: 1,
      assignedTeamId: new mongoose.Types.ObjectId(),
      assignedTeamName: 'Team Alpha',
      items: [{ lineId: 'L1', inventoryId, name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true }],
    });
    mockFindRequest(doc);
    let capturedUpdate;
    Inventory.findOneAndUpdate = async (filter, update) => {
      capturedUpdate = update;
      return { available: 3, reserved: 0 };
    };

    const result = await service.handoverMaterialRequest('WPR-TEST-1', { statusVersion: 1 }, { role: 'INVENTORY' });

    assert.equal(result.status, 'completed');
    assert.deepEqual(capturedUpdate, { $inc: { reserved: -2 } });
  });

  it('backfills a legacy request missing sourceMaterialRequestId via the reverse JobMaterialRequest link before reserving', async () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const jmrId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      sourceMaterialRequestId: undefined,
      items: [{ lineId: 'L1', inventoryId, name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true }],
    });
    assert.equal(doc.sourceMaterialRequestId, undefined);
    mockFindRequest(doc);
    JobMaterialRequest.findOne = (query) => ({
      session: async () => (String(query.warehousePickRequestId) === String(doc._id) ? { _id: jmrId } : null),
    });
    stubInventoryFind([{ _id: inventoryId, sku: 'SKU-1', name: 'Widget', available: 5 }]);
    const stockById = new Map([[String(inventoryId), { available: 5, reserved: 0, reorderLevel: 1 }]]);
    stubInventoryFindOneAndUpdate(stockById);
    let capturedFilter;
    JobMaterialRequest.updateOne = async (filter) => { capturedFilter = filter; return { acknowledged: true }; };

    const result = await service.reserveMaterialRequest('WPR-TEST-1', { statusVersion: 0 }, { role: 'INVENTORY' });

    assert.equal(String(result.sourceMaterialRequestId), String(jmrId));
    assert.equal(String(capturedFilter._id), String(jmrId));
  });

  it('reserves a legacy request with no resolvable JobMaterialRequest link at all (truly orphaned)', async () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      sourceMaterialRequestId: undefined,
      items: [{ lineId: 'L1', inventoryId, name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true }],
    });
    doc.isNew = false; // simulates a document already persisted before sourceMaterialRequestId existed
    mockFindRequest(doc);
    JobMaterialRequest.findOne = () => ({ session: async () => null });
    stubInventoryFind([{ _id: inventoryId, sku: 'SKU-1', name: 'Widget', available: 5 }]);
    const stockById = new Map([[String(inventoryId), { available: 5, reserved: 0, reorderLevel: 1 }]]);
    stubInventoryFindOneAndUpdate(stockById);

    const result = await service.reserveMaterialRequest('WPR-TEST-1', { statusVersion: 0 }, { role: 'INVENTORY' });

    assert.equal(result.status, 'reserved');
    assert.equal(result.sourceMaterialRequestId, undefined);
  });

  it('handover requires an assigned team', async () => {
    const doc = pickRequestDoc({ status: 'reserved', statusVersion: 1, assignedTeamId: undefined });
    mockFindRequest(doc);
    await assert.rejects(
      service.handoverMaterialRequest('WPR-TEST-1', { statusVersion: 1 }, { role: 'INVENTORY' }),
      (error) => error.statusCode === 409 && error.code === 'TEAM_ASSIGNMENT_REQUIRED',
    );
  });

  it('handover self-heals the team assignment from the job when the pick request never got it copied over', async () => {
    const teamId = new mongoose.Types.ObjectId();
    const inventoryId = new mongoose.Types.ObjectId();
    const doc = pickRequestDoc({
      status: 'reserved',
      statusVersion: 1,
      assignedTeamId: undefined,
      items: [{ lineId: 'L1', inventoryId, name: 'Widget', qty: 2, sku: 'SKU-1', confirmed: true }],
    });
    mockFindRequest(doc);
    const stockById = new Map([[String(inventoryId), { available: 3, reserved: 2 }]]);
    stubInventoryFindOneAndUpdate(stockById);
    materialWorkflow.modelForJobType = () => ({
      updateOne: async () => ({ acknowledged: true }),
      findById: () => ({
        select: () => ({ session: () => ({ lean: async () => ({ assignedTeamId: teamId, assignedTeamName: 'Alpha Team' }) }) }),
      }),
    });

    const result = await service.handoverMaterialRequest('WPR-TEST-1', { statusVersion: 1 }, { role: 'INVENTORY' });

    assert.equal(String(result.assignedTeamId), String(teamId));
    assert.equal(result.assignedTeamName, 'Alpha Team');
    assert.equal(result.status, 'completed');
  });
});
