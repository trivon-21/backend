/**
 * Legacy PurchaseRequest model adapter (AR-03 / Epic 20)
 *
 * Retired duplicate loose schema registration.
 * All purchase request queries and mutations are consolidated under the
 * canonical PurchaseRequest model at src/models/PurchaseRequest.js.
 */
const mongoose = require('mongoose');
const PurchaseRequest = require('../../models/PurchaseRequest');

// Provide alias if legacy callers attempt mongoose.model("L_PurchaseRequest")
if (!mongoose.models.L_PurchaseRequest) {
  mongoose.models.L_PurchaseRequest = PurchaseRequest;
}

module.exports = PurchaseRequest;