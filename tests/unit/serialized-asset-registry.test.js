const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SerializedAsset = require('../../src/models/SerializedAsset');
const { normalizeSerialNumber } = require('../../src/utils/serialized-asset-domain');
const { buildRegistryPlan, migrate } = require('../../scripts/migrate-serialized-assets');

describe('Serialized asset registry', () => {
  it('normalizes serial numbers for global case- and whitespace-insensitive uniqueness', async () => {
    assert.equal(normalizeSerialNumber('  pump-００１  '), 'PUMP-001');
    const asset = new SerializedAsset({
      inventoryId: new mongoose.Types.ObjectId(),
      serialNumber: '  Pump-001 ',
      status: 'available',
    });

    await asset.validate();

    assert.equal(asset.serialNumber, 'Pump-001');
    assert.equal(asset.normalizedSerial, 'PUMP-001');
    const normalizedIndex = SerializedAsset.schema.indexes()
      .find(([keys]) => keys.normalizedSerial === 1);
    assert.equal(normalizedIndex[1].unique, true);
  });

  it('plans one registry row per legacy serial and reports normalized collisions', () => {
    const firstId = new mongoose.Types.ObjectId();
    const secondId = new mongoose.Types.ObjectId();
    const plan = buildRegistryPlan({
      inventory: [
        { _id: firstId, isSerialized: true, serialNumbers: [' Tool-1 ', 'TOOL-2'] },
        { _id: secondId, isSerialized: true, serialNumbers: ['tool-1'] },
      ],
      loans: [],
      rmaCases: [],
      quarantineItems: [],
    });

    assert.equal(plan.assets.length, 2);
    assert.equal(plan.duplicateSerials.length, 1);
    assert.equal(plan.duplicateSerials[0].normalizedSerial, 'TOOL-1');
    assert.deepEqual(plan.duplicateSerials[0].inventoryIds.sort(), [String(firstId), String(secondId)].sort());
  });

  it('derives active workflow state and flags unknown legacy references', () => {
    const inventoryId = new mongoose.Types.ObjectId();
    const loanId = new mongoose.Types.ObjectId();
    const plan = buildRegistryPlan({
      inventory: [{ _id: inventoryId, isSerialized: true, serialNumbers: ['TAG-1', 'TAG-2'] }],
      loans: [{ _id: loanId, assetTag: ' tag-1 ', status: 'on-loan' }, { assetTag: 'UNKNOWN', status: 'on-loan' }],
      rmaCases: [{ _id: new mongoose.Types.ObjectId(), serialNumber: 'TAG-2', status: 'reported' }],
      quarantineItems: [],
    });

    assert.equal(plan.assets.find((asset) => asset.normalizedSerial === 'TAG-1').status, 'on-loan');
    assert.equal(String(plan.assets.find((asset) => asset.normalizedSerial === 'TAG-1').currentLoanId), String(loanId));
    assert.equal(plan.assets.find((asset) => asset.normalizedSerial === 'TAG-2').status, 'rma');
    assert.equal(String(plan.loanLinks[0].serializedAssetId), String(plan.assets[0]._id));
    assert.equal(plan.rmaLinks.length, 1);
    assert.deepEqual(plan.unknownReferences, [{ source: 'asset_loans', serialNumber: 'UNKNOWN' }]);
  });

  it('keeps dry runs read-only', async () => {
    let writes = 0;
    const values = {
      inventory: [{ _id: new mongoose.Types.ObjectId(), isSerialized: true, serialNumbers: ['TAG-1'] }],
      asset_loans: [], rma_cases: [], quarantine_items: [],
    };
    const db = {
      collection(name) {
        return {
          find: () => ({ toArray: async () => values[name] || [] }),
          bulkWrite: async () => { writes += 1; },
        };
      },
    };

    const summary = await migrate({ db, apply: false, logger: { table() {}, log() {} } });

    assert.equal(summary.mode, 'DRY_RUN');
    assert.equal(summary.assetsPlanned, 1);
    assert.equal(writes, 0);
  });
});
