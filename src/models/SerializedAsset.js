const mongoose = require('mongoose');
const { normalizeSerialNumber } = require('../utils/serialized-asset-domain');

const SerializedAssetSchema = new mongoose.Schema({
  inventoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ManagerInventoryItem',
    required: true,
    index: true,
  },
  serialNumber: { type: String, required: true, trim: true, immutable: true },
  normalizedSerial: { type: String, required: true, immutable: true },
  status: {
    type: String,
    enum: [
      'available',
      'on-loan',
      'quarantined',
      'rma',
      'retired',
      'inspection-hold',
      'supplier-return-pending',
      'returned-to-supplier',
    ],
    default: 'available',
    index: true,
  },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  procurementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Procurement' },
  receiptDiscrepancyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptDiscrepancy' },
  quarantineId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuarantineItem' },
  currentLoanId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetLoan' },
  activeRmaCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'RmaCase' },
  preRmaStatus: {
    type: String,
    enum: ['available', 'quarantined', 'inspection-hold', 'supplier-return-pending'],
  },
  replacementForAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'SerializedAsset' },
  replacedByAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'SerializedAsset' },
  retiredAt: { type: Date },
  receiptEventId: { type: String, default: '', trim: true },
  location: { type: String, default: '', trim: true },
  binLocation: { type: String, default: '', trim: true },
  origin: { type: String, enum: ['receipt', 'migration'], default: 'receipt' },
}, {
  timestamps: true,
  collection: 'serialized_assets',
});

SerializedAssetSchema.pre('validate', function synchronizeNormalizedSerial() {
  const displaySerial = String(this.serialNumber || '').normalize('NFKC').trim();
  const normalizedSerial = normalizeSerialNumber(displaySerial);
  if (!normalizedSerial) {
    this.invalidate('serialNumber', 'Serial number is required');
    return;
  }
  this.serialNumber = displaySerial;
  this.normalizedSerial = normalizedSerial;
});

SerializedAssetSchema.index({ normalizedSerial: 1 }, { unique: true });
SerializedAssetSchema.index({ inventoryId: 1, status: 1 });

module.exports = mongoose.models.SerializedAsset
  || mongoose.model('SerializedAsset', SerializedAssetSchema);
