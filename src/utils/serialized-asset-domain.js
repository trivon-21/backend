'use strict';

function normalizeSerialNumber(value) {
  return String(value ?? '').normalize('NFKC').trim().toUpperCase();
}

module.exports = { normalizeSerialNumber };
