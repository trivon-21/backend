const assert = require('node:assert/strict');
const { rejectProtectedStockFields, PROTECTED_STOCK_FIELDS } = require('../../src/modules/inventory-manager/services/shared');

// rejectProtectedStockFields is the wall that forces available/reserved to
// move only through a stock workflow (receipts, reservations, adjustments)
// and never through the product catalog. It was previously untested.
describe('rejectProtectedStockFields', () => {
  it('protects exactly the five documented stock fields', () => {
    assert.deepEqual(PROTECTED_STOCK_FIELDS, ['available', 'reserved', 'serialNumbers', 'status', 'category']);
  });

  for (const field of ['available', 'reserved', 'serialNumbers', 'status', 'category']) {
    it(`throws USE_STOCK_WORKFLOW when ${field} is present in the payload`, () => {
      assert.throws(
        () => rejectProtectedStockFields({ name: 'Widget', [field]: field === 'serialNumbers' ? [] : 1 }),
        (error) => error.statusCode === 400 && error.code === 'USE_STOCK_WORKFLOW' && error.message.includes(field),
      );
    });
  }

  it('rejects an explicit undefined value for a protected field, not just a set one', () => {
    assert.throws(
      () => rejectProtectedStockFields({ available: undefined }),
      (error) => error.code === 'USE_STOCK_WORKFLOW',
    );
  });

  it('allows a payload with no protected fields through', () => {
    assert.doesNotThrow(() => rejectProtectedStockFields({ name: 'Widget', unitCost: 10 }));
  });

  it('allows an empty payload through', () => {
    assert.doesNotThrow(() => rejectProtectedStockFields({}));
  });
});
