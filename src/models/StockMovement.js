const mongoose = require('mongoose');

// The audited ledger for every change to ManagerInventoryItem's
// available/reserved fields. Existing writers (procurement receipts,
// material-request reserve/release/handover, quarantine, leftover returns)
// each write one row per stock move alongside their own domain records
// (Procurement, WarehousePickRequest, QuarantineItem, LeftoverReturn) — this
// model does not replace those, it makes the available/reserved side of
// them reconstructable and auditable in one place.
const StockMovementSchema = new mongoose.Schema({
  movementId: { type: String, required: true, unique: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem', required: true, index: true },
  sku: { type: String, default: '' },
  itemName: { type: String, default: '' },
  movementType: {
    type: String,
    enum: [
      'OPENING', 'ADJUSTMENT', 'WRITE_OFF',
      'RECEIPT', 'RESERVE', 'RELEASE', 'ISSUE',
      'RETURN_RESTOCK', 'QUARANTINE_OUT', 'QUARANTINE_DISPOSAL',
    ],
    required: true,
  },
  reasonCode: {
    type: String,
    enum: [
      '', 'OPENING_BALANCE', 'CYCLE_COUNT_VARIANCE', 'SHRINKAGE', 'DAMAGE',
      'DATA_CORRECTION', 'RECEIPT', 'MATERIAL_REQUEST', 'LEFTOVER_RETURN',
      'QUARANTINE', 'DISPOSAL',
    ],
    default: '',
  },
  availableDelta: { type: Number, required: true, validate: Number.isInteger },
  reservedDelta: { type: Number, required: true, validate: Number.isInteger },
  // Post-image snapshot, so the ledger can be replayed and cross-checked
  // against the live document without re-deriving every prior movement.
  availableAfter: { type: Number, required: true, min: 0 },
  reservedAfter: { type: Number, required: true, min: 0 },
  sourceType: {
    type: String,
    enum: ['PROCUREMENT', 'WAREHOUSE_PICK_REQUEST', 'LEFTOVER_RETURN', 'QUARANTINE', 'RMA', 'MANUAL', 'SCRIPT'],
    required: true,
  },
  sourceRefId: { type: String, default: '' },
  // Idempotency key: a retried transaction reusing the same key must never
  // double-log the same movement. Mirrors Procurement.receiptEventId.
  movementEventId: { type: String, unique: true, sparse: true },
  note: { type: String, default: '' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'stock_movements',
});

StockMovementSchema.index({ inventoryId: 1, createdAt: -1 });
StockMovementSchema.index({ createdAt: -1 });

StockMovementSchema.pre('validate', function requireNonZeroDelta() {
  if (!this.availableDelta && !this.reservedDelta) {
    this.invalidate('availableDelta', 'A stock movement must change available and/or reserved');
  }
});

module.exports = mongoose.models.StockMovement || mongoose.model('StockMovement', StockMovementSchema);
