const RMA_STATUSES = Object.freeze([
  'reported',
  'under-review',
  'sent-to-supplier',
  'replacement-pending',
  'resolved',
  'closed',
]);

const VALID_RMA_TRANSITIONS = Object.freeze({
  'reported': ['under-review'],
  'under-review': ['sent-to-supplier', 'resolved'],
  'sent-to-supplier': ['replacement-pending'],
  'replacement-pending': ['resolved'],
  'resolved': ['closed'],
  'closed': [],
});

function rmaError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function dispositionForReturnCondition(condition) {
  const normalized = String(condition || '').trim().toLowerCase();
  if (!['good', 'damaged', 'incomplete'].includes(normalized)) {
    throw rmaError('Return condition must be good, damaged, or incomplete', 400, 'INVALID_RETURN_CONDITION');
  }
  if (normalized === 'good') {
    return {
      assetStatus: 'available',
      requiresQuarantine: false,
      requiresRma: false,
    };
  }
  if (normalized === 'incomplete') {
    return {
      assetStatus: 'inspection-hold',
      requiresQuarantine: true,
      requiresRma: false,
    };
  }
  return {
    assetStatus: 'supplier-return-pending',
    requiresQuarantine: true,
    requiresRma: true,
  };
}

function assertRmaTransition(currentStatus, nextStatus, options = {}) {
  const allowed = VALID_RMA_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw rmaError(`Invalid status transition from '${currentStatus}' to '${nextStatus}'`, 400, 'INVALID_RMA_TRANSITION');
  }

  if (currentStatus === 'under-review' && nextStatus === 'resolved') {
    const resolutionType = options.resolutionType || (options.resolution ? 'internal-repair' : undefined);
    if (resolutionType !== 'internal-repair') {
      throw rmaError('Direct resolution from under-review requires resolutionType internal-repair', 400, 'INTERNAL_REPAIR_REQUIRED');
    }
    const note = String(options.resolutionNote || options.resolution || '').trim();
    if (!note) {
      throw rmaError('A resolution note is required for internal repair', 400, 'RESOLUTION_NOTE_REQUIRED');
    }
  }
}

function assertReplacementSerial(serial) {
  const normalized = String(serial ?? '').trim();
  if (!normalized) {
    throw rmaError('Replacement serial number is required', 400, 'REPLACEMENT_SERIAL_REQUIRED');
  }
  return normalized;
}

module.exports = {
  RMA_STATUSES,
  VALID_RMA_TRANSITIONS,
  dispositionForReturnCondition,
  assertRmaTransition,
  assertReplacementSerial,
};
