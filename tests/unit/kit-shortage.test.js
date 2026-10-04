const assert = require('node:assert/strict');
const {
  aggregateReservationLines,
  computeKitShortages,
  legacyStockStatus,
  STOCK_STATUS_PIPELINE_EXPR,
} = require('../../src/utils/inventory-domain');

// Evaluates the $switch expression from STOCK_STATUS_PIPELINE_EXPR the same
// way the Mongo aggregation engine would, so it can be checked against
// legacyStockStatus() without a real database.
function evalStatusExpr(available, reorderLevel) {
  const branches = STOCK_STATUS_PIPELINE_EXPR.$switch.branches;
  const stock = available == null ? 0 : available;
  const critical = stock <= 0;
  if (critical) return branches[0].then;
  const threshold = Math.max(0, reorderLevel == null ? 0 : reorderLevel);
  if (stock <= threshold) return branches[1].then;
  return STOCK_STATUS_PIPELINE_EXPR.$switch.default;
}

describe('aggregateReservationLines', () => {
  it('sums quantities for lines sharing the same inventoryId', () => {
    const groups = aggregateReservationLines([
      { lineId: 'L1', inventoryId: 'ITEM-1', sku: 'SKU-1', qty: 2 },
      { lineId: 'L2', inventoryId: 'ITEM-1', sku: 'SKU-1', qty: 3 },
      { lineId: 'L3', inventoryId: 'ITEM-2', sku: 'SKU-2', qty: 1 },
    ]);
    assert.equal(groups.length, 2);
    const itemOne = groups.find((g) => g.inventoryId === 'ITEM-1');
    assert.equal(itemOne.totalQty, 5);
    assert.deepEqual(itemOne.lineIds, ['L1', 'L2']);
    const itemTwo = groups.find((g) => g.inventoryId === 'ITEM-2');
    assert.equal(itemTwo.totalQty, 1);
  });

  it('returns one group per line when every inventoryId is distinct', () => {
    const groups = aggregateReservationLines([
      { lineId: 'L1', inventoryId: 'A', qty: 1 },
      { lineId: 'L2', inventoryId: 'B', qty: 4 },
    ]);
    assert.equal(groups.length, 2);
  });

  it('handles an empty or missing line list', () => {
    assert.deepEqual(aggregateReservationLines([]), []);
    assert.deepEqual(aggregateReservationLines(undefined), []);
  });
});

describe('computeKitShortages', () => {
  it('reports no shortage when aggregated stock covers the aggregated requirement', () => {
    const groups = aggregateReservationLines([
      { lineId: 'L1', inventoryId: 'ITEM-1', sku: 'SKU-1', qty: 2 },
      { lineId: 'L2', inventoryId: 'ITEM-1', sku: 'SKU-1', qty: 2 },
    ]);
    const stockById = new Map([['ITEM-1', { available: 4, sku: 'SKU-1', name: 'Widget' }]]);
    assert.deepEqual(computeKitShortages(groups, stockById), []);
  });

  it('flags duplicate-line requests that would have passed a naive per-line check', () => {
    // Two lines each ask for 3 units of the same item; stock has 4 total.
    // A per-line check (3 <= 4, 3 <= 4) would wrongly pass both.
    const groups = aggregateReservationLines([
      { lineId: 'L1', inventoryId: 'ITEM-1', sku: 'SKU-1', qty: 3 },
      { lineId: 'L2', inventoryId: 'ITEM-1', sku: 'SKU-1', qty: 3 },
    ]);
    const stockById = new Map([['ITEM-1', { available: 4, sku: 'SKU-1', name: 'Widget' }]]);
    const shortages = computeKitShortages(groups, stockById);
    assert.equal(shortages.length, 1);
    assert.equal(shortages[0].required, 6);
    assert.equal(shortages[0].available, 4);
    assert.equal(shortages[0].shortage, 2);
    assert.deepEqual(shortages[0].lineIds, ['L1', 'L2']);
  });

  it('treats a missing stock document as zero available', () => {
    const groups = aggregateReservationLines([{ lineId: 'L1', inventoryId: 'GHOST', sku: 'SKU-X', qty: 1 }]);
    const shortages = computeKitShortages(groups, new Map());
    assert.equal(shortages.length, 1);
    assert.equal(shortages[0].available, 0);
    assert.equal(shortages[0].shortage, 1);
  });

  it('matches quantities exactly without flagging a shortage', () => {
    const groups = aggregateReservationLines([{ lineId: 'L1', inventoryId: 'ITEM-1', qty: 5 }]);
    const stockById = new Map([['ITEM-1', { available: 5 }]]);
    assert.deepEqual(computeKitShortages(groups, stockById), []);
  });
});

describe('STOCK_STATUS_PIPELINE_EXPR parity with legacyStockStatus', () => {
  it('agrees with legacyStockStatus() over a matrix of available/reorderLevel values', () => {
    const availableValues = [0, 1, 2, 5, 9, 10, 11, 25, 100];
    const reorderValues = [0, 1, 5, 10, 20];
    for (const available of availableValues) {
      for (const reorderLevel of reorderValues) {
        assert.equal(
          evalStatusExpr(available, reorderLevel),
          legacyStockStatus(available, reorderLevel),
          `mismatch at available=${available}, reorderLevel=${reorderLevel}`,
        );
      }
    }
  });

  it('treats a missing reorderLevel as zero, matching legacyStockStatus', () => {
    assert.equal(evalStatusExpr(0, undefined), legacyStockStatus(0, undefined));
    assert.equal(evalStatusExpr(3, undefined), legacyStockStatus(3, undefined));
  });
});
