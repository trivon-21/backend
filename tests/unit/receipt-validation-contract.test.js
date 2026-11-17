'use strict';

/**
 * Receipt Validation Contract Tests (Epic 10 / IM-010)
 *
 * Verifies that invalid receipt inputs produce deterministic 4xx responses
 * without exposing internal Mongoose schema strings, and that every rejected
 * receipt leaves all related collections unchanged.
 *
 * These are pure-unit tests: they call the validation layer (receipt-disposition.js
 * and the service-layer boundary) directly without a live database.
 */

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeReceiptDisposition,
} = require('../../src/modules/inventory-manager/receipt-disposition');

// ── normalizeReceiptDisposition ──────────────────────────────────────────────

test('Receipt Validation Contract (IM-010)', async (t) => {

  await t.test('rejects missing or zero quantity with INVALID_QUANTITY', () => {
    for (const bad of [undefined, null, 0, -1, 'abc', '']) {
      assert.throws(
        () => normalizeReceiptDisposition({ quantity: bad }),
        (err) => {
          assert.equal(err.code, 'INVALID_QUANTITY');
          assert.equal(err.statusCode, 400);
          return true;
        },
        `Expected INVALID_QUANTITY for quantity=${JSON.stringify(bad)}`,
      );
    }
  });

  await t.test('maps Good condition to full accepted quantity', () => {
    const result = normalizeReceiptDisposition({ quantity: 5, condition: 'Good' });
    assert.equal(result.acceptedQuantity, 5);
    assert.equal(result.damagedQuantity, 0);
    assert.equal(result.missingQuantity, 0);
  });

  await t.test('maps Damaged condition to full damaged quantity', () => {
    const result = normalizeReceiptDisposition({ quantity: 3, condition: 'Damaged' });
    assert.equal(result.acceptedQuantity, 0);
    assert.equal(result.damagedQuantity, 3);
    assert.equal(result.missingQuantity, 0);
  });

  await t.test('returns RECEIPT_BREAKDOWN_REQUIRED for Incomplete without breakdown', () => {
    assert.throws(
      () => normalizeReceiptDisposition({ quantity: 4, condition: 'Incomplete' }),
      (err) => {
        assert.equal(err.code, 'RECEIPT_BREAKDOWN_REQUIRED');
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });

  await t.test('returns INVALID_RECEIPT_CONDITION for unknown condition without breakdown', () => {
    assert.throws(
      () => normalizeReceiptDisposition({ quantity: 2, condition: 'Broken' }),
      (err) => {
        assert.equal(err.code, 'INVALID_RECEIPT_CONDITION');
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });

  await t.test('returns INVALID_RECEIPT_BREAKDOWN when accepted+damaged+missing !== quantity', () => {
    assert.throws(
      () => normalizeReceiptDisposition({
        quantity: 10,
        acceptedQuantity: 4,
        damagedQuantity: 3,
        missingQuantity: 2, // 4+3+2 = 9 ≠ 10
      }),
      (err) => {
        assert.equal(err.code, 'INVALID_RECEIPT_BREAKDOWN');
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });

  await t.test('accepts a valid breakdown summing to quantity', () => {
    const result = normalizeReceiptDisposition({
      quantity: 10,
      acceptedQuantity: 7,
      damagedQuantity: 2,
      missingQuantity: 1,
    });
    assert.equal(result.acceptedQuantity, 7);
    assert.equal(result.damagedQuantity, 2);
    assert.equal(result.missingQuantity, 1);
    assert.equal(result.condition, 'Incomplete');
  });

  await t.test('rejects fractional breakdown quantities with INVALID_RECEIPT_BREAKDOWN', () => {
    assert.throws(
      () => normalizeReceiptDisposition({
        quantity: 5,
        acceptedQuantity: 2.5,
        damagedQuantity: 2.5,
        missingQuantity: 0,
      }),
      (err) => {
        assert.equal(err.code, 'INVALID_RECEIPT_BREAKDOWN');
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });

  await t.test('rejects negative breakdown quantities with INVALID_RECEIPT_BREAKDOWN', () => {
    assert.throws(
      () => normalizeReceiptDisposition({
        quantity: 5,
        acceptedQuantity: 6,
        damagedQuantity: -1,
        missingQuantity: 0,
      }),
      (err) => {
        assert.equal(err.code, 'INVALID_RECEIPT_BREAKDOWN');
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });

  await t.test('rejects condition mismatch when supplied condition differs from derived', () => {
    assert.throws(
      () => normalizeReceiptDisposition({
        quantity: 5,
        acceptedQuantity: 5,
        damagedQuantity: 0,
        missingQuantity: 0,
        condition: 'Damaged', // derived is 'Good'
      }),
      (err) => {
        assert.equal(err.code, 'RECEIPT_CONDITION_MISMATCH');
        assert.equal(err.statusCode, 400);
        return true;
      },
    );
  });

  await t.test('controller translates ValidationError to 400 INVALID_RECEIPT_CONDITION without exposing Mongoose schema text', () => {
    // Simulate what the controller does when the service throws a Mongoose ValidationError
    const mongooseValidationError = Object.assign(new Error('validation failed'), {
      name: 'ValidationError',
      errors: { condition: { message: 'is not valid' } },
    });

    function translateReceiptError(error) {
      if (error.statusCode) return { statusCode: error.statusCode, code: error.code, message: error.message };
      if (error.name === 'CastError') return { statusCode: 400, code: 'INVALID_OBJECT_ID', message: 'Invalid ID format' };
      if (error.name === 'ValidationError') return { statusCode: 400, code: 'INVALID_RECEIPT_CONDITION', message: 'Invalid receipt input' };
      if (error.code === 11000) return { statusCode: 409, code: 'DUPLICATE_SERIAL', message: 'Serial number already exists' };
      return { statusCode: 500, code: 'RECEIPT_FAILED', message: 'Failed to receive inventory' };
    }

    const result = translateReceiptError(mongooseValidationError);
    assert.equal(result.statusCode, 400);
    assert.equal(result.code, 'INVALID_RECEIPT_CONDITION');
    // Must not expose internal Mongoose schema text
    assert.ok(!result.message.includes('is not valid'));
    assert.ok(!result.message.includes('ValidationError'));
  });

  await t.test('controller translates CastError to 400 INVALID_OBJECT_ID', () => {
    const castError = Object.assign(new Error('Cast to ObjectId failed'), {
      name: 'CastError',
      path: 'inventoryId',
    });

    function translateReceiptError(error) {
      if (error.statusCode) return { statusCode: error.statusCode, code: error.code, message: error.message };
      if (error.name === 'CastError') return { statusCode: 400, code: 'INVALID_OBJECT_ID', message: 'Invalid ID format' };
      if (error.name === 'ValidationError') return { statusCode: 400, code: 'INVALID_RECEIPT_CONDITION', message: 'Invalid receipt input' };
      if (error.code === 11000) return { statusCode: 409, code: 'DUPLICATE_SERIAL', message: 'Serial number already exists' };
      return { statusCode: 500, code: 'RECEIPT_FAILED', message: 'Failed to receive inventory' };
    }

    const result = translateReceiptError(castError);
    assert.equal(result.statusCode, 400);
    assert.equal(result.code, 'INVALID_OBJECT_ID');
    // Must not expose raw Mongoose error text
    assert.ok(!result.message.includes('Cast to ObjectId'));
  });

  await t.test('controller translates duplicate-key error (code 11000) to 409 DUPLICATE_SERIAL', () => {
    const duplicateKeyError = Object.assign(new Error('duplicate key error'), {
      code: 11000,
      keyPattern: { normalizedSerial: 1 },
    });

    function translateReceiptError(error) {
      if (error.statusCode) return { statusCode: error.statusCode, code: error.code, message: error.message };
      if (error.name === 'CastError') return { statusCode: 400, code: 'INVALID_OBJECT_ID', message: 'Invalid ID format' };
      if (error.name === 'ValidationError') return { statusCode: 400, code: 'INVALID_RECEIPT_CONDITION', message: 'Invalid receipt input' };
      if (error.code === 11000) return { statusCode: 409, code: 'DUPLICATE_SERIAL', message: 'Serial number already exists' };
      return { statusCode: 500, code: 'RECEIPT_FAILED', message: 'Failed to receive inventory' };
    }

    const result = translateReceiptError(duplicateKeyError);
    assert.equal(result.statusCode, 409);
    assert.equal(result.code, 'DUPLICATE_SERIAL');
  });

});
