const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveStockStatus,
  legacyStockStatus,
  normalizeStringList,
  suggestedOrderQuantity,
  classifyLegacyItem,
  isValidClassification,
  INVENTORY_LOCATIONS,
  isValidInventoryLocation,
  rackTagFor,
  formatStorageLocation
} = require('../src/utils/inventory-domain');

test('derives stock status at threshold boundaries including zero reorder level', () => {
  assert.equal(deriveStockStatus(0, 5), 'out-of-stock');
  assert.equal(deriveStockStatus(1, 5), 'low-stock');
  assert.equal(deriveStockStatus(5, 5), 'low-stock');
  assert.equal(deriveStockStatus(6, 5), 'in-stock');
  assert.equal(deriveStockStatus(1, 0), 'in-stock');
});

test('validates shared product-class and subcategory pairs', () => {
  assert.equal(isValidClassification('Spare Parts', 'Compressor'), true);
  assert.equal(isValidClassification('Spare Parts', 'Vacuum Pump'), false);
  assert.equal(isValidClassification('Unknown', 'Compressor'), false);
});

test('allows only fixed warehouse, rack and bin combinations', () => {
  assert.equal(INVENTORY_LOCATIONS.length, 3);
  assert.deepEqual(INVENTORY_LOCATIONS[0].racks.map((rack) => rack.rackTag), ['R1', 'R2', 'R3', 'R4', 'R5']);
  assert.equal(INVENTORY_LOCATIONS[0].warehouseLabel, 'Warehouse A');
  assert.equal(isValidInventoryLocation('A', 'A201'), true);
  assert.equal(isValidInventoryLocation('A', 'A206'), false);
  assert.equal(isValidInventoryLocation('B', 'A201'), false);
  assert.equal(isValidInventoryLocation('A', 'A-05'), false);
  assert.equal(isValidInventoryLocation('Made Up Warehouse', 'A201'), false);
});

test('describes a bin as warehouse, rack and bin code', () => {
  assert.equal(rackTagFor('A', 'A201'), 'R2');
  assert.equal(rackTagFor('A', 'A-05'), '');
  assert.equal(formatStorageLocation('A', 'A201'), 'Warehouse A, R2, A201');
  assert.equal(formatStorageLocation('A', 'A-05'), 'Warehouse A, A-05');
  assert.equal(formatStorageLocation('', ''), '');
});

test('suggests replenishment to maximum stock with a minimum of one', () => {
  assert.equal(suggestedOrderQuantity(2, 10, 4), 8);
  assert.equal(suggestedOrderQuantity(0, 0, 0), 1);
  assert.equal(suggestedOrderQuantity(10, 10, 4), 1);
});

test('retains legacy API status compatibility', () => {
  assert.equal(legacyStockStatus(0, 5), 'critical');
  assert.equal(legacyStockStatus(5, 5), 'warning');
  assert.equal(legacyStockStatus(6, 5), 'normal');
});

test('normalizes comma-separated and repeated technical values', () => {
  assert.deepEqual(normalizeStringList('R32, R410A, R32'), ['R32', 'R410A']);
  assert.deepEqual(normalizeStringList(['VP67-01', 'VP67-01', 'VP67-02']), ['VP67-01', 'VP67-02']);
});

test('conservatively maps only known legacy classes', () => {
  assert.equal(classifyLegacyItem('Tools'), 'Tools and Test Equipment');
  assert.equal(classifyLegacyItem('Repair Parts'), 'Spare Parts');
  assert.equal(classifyLegacyItem('Plumbing'), 'Unclassified');
  assert.equal(classifyLegacyItem('Tools', 'Consumables'), 'Consumables');
});
