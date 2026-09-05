const assert = require('node:assert/strict');
const {
  RMA_STATUSES,
  VALID_RMA_TRANSITIONS,
  assertRmaTransition,
  dispositionForReturnCondition,
  assertReplacementSerial,
} = require('../../src/utils/rma-workflow');

describe('RMA workflow and return disposition', () => {
  it('includes replacement-pending in RMA statuses', () => {
    assert.ok(RMA_STATUSES.includes('replacement-pending'));
    assert.deepEqual(RMA_STATUSES, [
      'reported',
      'under-review',
      'sent-to-supplier',
      'replacement-pending',
      'resolved',
      'closed',
    ]);
  });

  it('enforces strict canonical RMA transitions', () => {
    assert.deepEqual(VALID_RMA_TRANSITIONS['reported'], ['under-review']);
    assert.deepEqual(VALID_RMA_TRANSITIONS['under-review'], ['sent-to-supplier', 'resolved']);
    assert.deepEqual(VALID_RMA_TRANSITIONS['sent-to-supplier'], ['replacement-pending']);
    assert.deepEqual(VALID_RMA_TRANSITIONS['replacement-pending'], ['resolved']);
    assert.deepEqual(VALID_RMA_TRANSITIONS['resolved'], ['closed']);
    assert.deepEqual(VALID_RMA_TRANSITIONS['closed'], []);
  });

  it('maps tool return conditions to disposition and quarantine requirements', () => {
    assert.deepEqual(dispositionForReturnCondition('good'), {
      assetStatus: 'available',
      requiresQuarantine: false,
      requiresRma: false,
    });

    assert.deepEqual(dispositionForReturnCondition('incomplete'), {
      assetStatus: 'inspection-hold',
      requiresQuarantine: true,
      requiresRma: false,
    });

    assert.deepEqual(dispositionForReturnCondition('damaged'), {
      assetStatus: 'supplier-return-pending',
      requiresQuarantine: true,
      requiresRma: true,
    });

    assert.throws(
      () => dispositionForReturnCondition('broken'),
      (error) => error.statusCode === 400 && error.code === 'INVALID_RETURN_CONDITION',
    );
  });

  it('requires internal-repair resolutionType and note when transitioning under-review to resolved', () => {
    assert.doesNotThrow(() => assertRmaTransition('under-review', 'resolved', {
      resolutionType: 'internal-repair',
      resolutionNote: 'Replaced faulty gasket internally',
    }));

    assert.throws(
      () => assertRmaTransition('under-review', 'resolved', {
        resolutionType: 'supplier-replacement',
        resolutionNote: 'Waiting for supplier',
      }),
      (error) => error.statusCode === 400 && error.code === 'INTERNAL_REPAIR_REQUIRED',
    );

    assert.throws(
      () => assertRmaTransition('under-review', 'resolved', {
        resolutionType: 'internal-repair',
        resolutionNote: '   ',
      }),
      (error) => error.statusCode === 400 && error.code === 'RESOLUTION_NOTE_REQUIRED',
    );
  });

  it('prohibits sent-to-supplier from skipping replacement-pending to resolved directly', () => {
    assert.throws(
      () => assertRmaTransition('sent-to-supplier', 'resolved'),
      (error) => error.code === 'INVALID_RMA_TRANSITION',
    );
  });

  it('validates replacement serial number', () => {
    assert.equal(assertReplacementSerial('  SN-12345-X  '), 'SN-12345-X');

    for (const invalid of ['', '   ', null, undefined]) {
      assert.throws(
        () => assertReplacementSerial(invalid),
        (error) => error.statusCode === 400 && error.code === 'REPLACEMENT_SERIAL_REQUIRED',
      );
    }
  });
});
