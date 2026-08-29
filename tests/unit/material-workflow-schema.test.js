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
    const collections = {
      job_material_requests: {
        countDocuments: async () => 2,
        aggregate: pipeline => ({ toArray: async () => calls.push(['job-backup', pipeline]) }),
        deleteMany: async () => calls.push(['job-delete']),
      },
      warehouse_pick_requests: {
        countDocuments: async () => 1,
        aggregate: pipeline => ({ toArray: async () => calls.push(['warehouse-backup', pipeline]) }),
        deleteMany: async () => calls.push(['warehouse-delete']),
      },
      inventory: {
        aggregate: () => ({ toArray: async () => [{ items: 1, units: 3 }] }),
        updateMany: async (_filter, pipeline) => calls.push(['stock-release', pipeline]),
      },
    };
    const db = { collection: name => collections[name] };
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
      'job-backup', 'warehouse-backup', 'job-delete', 'warehouse-delete', 'stock-release',
    ]);
    const releasePipeline = calls.at(-1)[1];
    assert.deepEqual(releasePipeline[0].$set.reserved, 0);
    assert.ok(releasePipeline[0].$set.available.$add);
  });
});
