'use strict';

function dispositionError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function wholeNumber(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw dispositionError(`${field} must be a non-negative whole number`, 'INVALID_RECEIPT_BREAKDOWN');
  }
  return number;
}

function normalizeReceiptDisposition(input = {}) {
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw dispositionError('Receipt quantity must be a positive whole number', 'INVALID_QUANTITY');
  }

  const hasBreakdown = ['acceptedQuantity', 'damagedQuantity', 'missingQuantity']
    .some((field) => input[field] !== undefined && input[field] !== null && input[field] !== '');
  if (!hasBreakdown) {
    if (!input.condition || input.condition === 'Good') {
      return { quantity, acceptedQuantity: quantity, damagedQuantity: 0, missingQuantity: 0, condition: 'Good' };
    }
    if (input.condition === 'Damaged') {
      return { quantity, acceptedQuantity: 0, damagedQuantity: quantity, missingQuantity: 0, condition: 'Damaged' };
    }
    if (input.condition === 'Incomplete') {
      throw dispositionError(
        'Incomplete receipts require accepted and missing quantities',
        'RECEIPT_BREAKDOWN_REQUIRED',
      );
    }
    throw dispositionError('Receipt condition must be Good, Damaged, or Incomplete', 'INVALID_RECEIPT_CONDITION');
  }

  const acceptedQuantity = wholeNumber(input.acceptedQuantity ?? 0, 'acceptedQuantity');
  const damagedQuantity = wholeNumber(input.damagedQuantity ?? 0, 'damagedQuantity');
  const missingQuantity = wholeNumber(input.missingQuantity ?? 0, 'missingQuantity');
  if (acceptedQuantity + damagedQuantity + missingQuantity !== quantity) {
    throw dispositionError(
      'Accepted, damaged, and missing quantities must equal the expected receipt quantity',
      'INVALID_RECEIPT_BREAKDOWN',
    );
  }
  const condition = missingQuantity > 0 ? 'Incomplete' : damagedQuantity > 0 ? 'Damaged' : 'Good';
  if (input.condition && input.condition !== condition) {
    throw dispositionError('Receipt condition does not match its quantity breakdown', 'RECEIPT_CONDITION_MISMATCH');
  }
  return { quantity, acceptedQuantity, damagedQuantity, missingQuantity, condition };
}

function receiptProgress(record, acceptedQuantity) {
  const orderedQuantity = Number(record.orderedQuantity ?? record.authorizedQuantity ?? record.quantity ?? 0);
  const receivedQuantity = Number(record.receivedQuantity || 0) + Number(acceptedQuantity || 0);
  const outstandingQuantity = Math.max(0, orderedQuantity - receivedQuantity);
  return {
    receivedQuantity,
    outstandingQuantity,
    status: outstandingQuantity === 0 ? 'completed' : receivedQuantity > 0 ? 'partially-received' : 'approved',
  };
}

function nextDiscrepancyState(discrepancy, disposition) {
  const outstanding = Number(discrepancy.outstandingQuantity || 0);
  if (Number(disposition.quantity) > outstanding) {
    throw dispositionError(
      'Replacement receipt exceeds the discrepancy outstanding quantity',
      'REPLACEMENT_EXCEEDS_DISCREPANCY',
      409,
    );
  }
  const resolvedQuantity = Number(discrepancy.resolvedQuantity || 0) + Number(disposition.acceptedQuantity || 0);
  const outstandingQuantity = Math.max(0, outstanding - Number(disposition.acceptedQuantity || 0));
  return {
    outstandingQuantity,
    resolvedQuantity,
    status: outstandingQuantity === 0 ? 'resolved' : 'replacement-pending',
  };
}

module.exports = { nextDiscrepancyState, normalizeReceiptDisposition, receiptProgress };
