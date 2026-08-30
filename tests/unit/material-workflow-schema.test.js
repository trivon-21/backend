const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const JobMaterialRequest = require('../../src/models/JobMaterialRequest');
const WarehousePickRequest = require('../../src/models/WarehousePickRequest');
const PurchaseRequest = require('../../src/models/PurchaseRequest');
const LeftoverReturn = require('../../src/models/LeftoverReturn');
const { resetWorkflow } = require('../../scripts/reset-material-workflow');

const objectId = () => new mongoose.Types.ObjectId();

describe('Material workflow schemas', () => {
  it('requires catalog-linked integer lines and separate approval and fulfillment states', () => {
    const request = new JobMaterialRequest({
      requestId: 'JMR-TEST-1', jobId: objectId(), jobType: 'Installation',
      requestedBy: objectId(), requesterName: 'Fixture Technician', status: 'APPROVED',
      fulfillmentStatus: 'PENDING',
      items: [{ inventoryId: objectId(), sku: 'PIPE-1', itemName: 'Pipe', quantity: 2, unitPrice: 100, total: 200 }],
    });
    assert.equal(request.validateSync(), undefined);
    request.items[0].quantity = 1.5;
    assert.ok(request.validateSync().errors['items.0.quantity']);
  });

  it('requires immutable source, job and inventory references on warehouse requests', () => {
    const request = new WarehousePickRequest({
      requestId: 'WPR-TEST-1', sourceMaterialRequestId: objectId(), jobId: objectId(),
      jobType: 'Repair', requesterId: objectId(), requester: 'Fixture Technician',
      date: '2026-08-29', location: 'Fixture site',
      items: [{ lineId: 'line-1', inventoryId: objectId(), name: 'Filter', sku: 'FLT-1', qty: 2 }],
    });
    assert.equal(request.validateSync(), undefined);
    request.sourceMaterialRequestId = undefined;
    assert.ok(request.validateSync().errors.sourceMaterialRequestId);
  });

  it('accepts canonical references on purchase requests and post-handover returns', () => {
    const purchase = new PurchaseRequest({
      requestId: 'REQ-TEST-1', supplierName: 'Fixture Supplier', requestedBy: 'Fixture Manager',
      source: 'material-request', sourceMaterialRequestId: objectId(),
      items: [{ inventoryId: objectId(), name: 'Filter', sku: 'FLT-1', quantity: 2, unitCost: 10 }],
    });
    const returned = new LeftoverReturn({
      returnId: 'LR-TEST-1', jobId: String(objectId()), warehousePickRequestId: objectId(),
      warehouseLineId: 'line-1', itemName: 'Filter', quantityReturned: 1,
      condition: 'good', returnedBy: 'Fixture Inventory Manager',
    });
    assert.equal(purchase.validateSync(), undefined);
    assert.equal(returned.validateSync(), undefined);
  });

  it('keeps reset dry runs read-only and applies database-side backups before releasing stock', async () => {
    const calls = [];
    const inventoryId = objectId();
    let jobDocuments = [{ _id: objectId() }, { _id: objectId() }];
    let warehouseDocuments = [{ _id: objectId() }];
    let inventoryDocuments = [{ _id: inventoryId, available: 7, reserved: 3 }];
    const backupCounts = new Map();
    const collections = {
      job_material_requests: {
        find: () => ({ toArray: async () => jobDocuments }),
        countDocuments: async () => jobDocuments.length,
        aggregate: pipeline => ({ toArray: async () => {
          calls.push(['job-backup', pipeline]);
          backupCounts.set(pipeline.at(-1).$out, jobDocuments.length);
        } }),
        deleteMany: async () => { calls.push(['job-delete']); jobDocuments = []; },
      },
      warehouse_pick_requests: {
        find: () => ({ toArray: async () => warehouseDocuments }),
        countDocuments: async () => warehouseDocuments.length,
        aggregate: pipeline => ({ toArray: async () => {
          calls.push(['warehouse-backup', pipeline]);
          backupCounts.set(pipeline.at(-1).$out, warehouseDocuments.length);
        } }),
        deleteMany: async () => { calls.push(['warehouse-delete']); warehouseDocuments = []; },
      },
      inventory: {
        find: () => ({ toArray: async () => inventoryDocuments }),
        aggregate: pipeline => ({ toArray: async () => {
          calls.push(['inventory-backup', pipeline]);
          backupCounts.set(pipeline.at(-1).$out, inventoryDocuments.length);
        } }),
        updateMany: async (_filter, pipeline) => {
          calls.push(['stock-release', pipeline]);
          inventoryDocuments = inventoryDocuments.map((item) => ({ ...item, available: item.available + item.reserved, reserved: 0 }));
        },
      },
      purchase_requests: { countDocuments: async () => 0 },
      leftover_returns: { countDocuments: async () => 0 },
    };
    const db = { collection: name => collections[name] || { countDocuments: async () => backupCounts.get(name) || 0 } };
    const logger = { table() {}, log() {} };
    const transaction = async callback => callback('fixture-session');

    const dryRun = await resetWorkflow({ db, logger, transaction });
    assert.equal(dryRun.mode, 'DRY_RUN');
    assert.deepEqual(calls, []);

    const applied = await resetWorkflow({
      db, apply: true, confirmed: true, logger, transaction,
      timestamp: new Date('2026-08-29T01:02:03.456Z'),
    });
    assert.equal(applied.mode, 'APPLY');
    assert.match(applied.jobBackup, /^job_material_requests_backup_/);
    assert.deepEqual(calls.map(call => call[0]), [
      'job-backup', 'warehouse-backup', 'inventory-backup', 'job-delete', 'warehouse-delete', 'stock-release',
    ]);
    const releasePipeline = calls.find(call => call[0] === 'stock-release')[1];
    assert.deepEqual(releasePipeline[0].$set.reserved, 0);
    assert.ok(releasePipeline[0].$set.available.$add);
  });
});
