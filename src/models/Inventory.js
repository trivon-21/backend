const mongoose = require('mongoose');
const {
  ITEM_CLASSES,
  INVENTORY_LOCATIONS,
  deriveStockStatus,
  legacyStockStatus,
  isValidInventoryLocation
} = require('../utils/inventory-domain');

const DEFAULT_LOCATION = INVENTORY_LOCATIONS[0];

const InventorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  type: { type: String, enum: ['Single', 'Kit', 'Bundle'], default: 'Single' },
  category: { type: String, required: true },
  itemClass: {
    type: String,
    enum: ITEM_CLASSES,
    default: 'Unclassified'
  },
  subcategory: { type: String, default: 'Unclassified', trim: true },
  brand: { type: String, required: true },
  manufacturerPartNumber: { type: String, default: '', trim: true },
  compatibleModels: [{ type: String, trim: true }],
  systemType: {
    type: String,
    enum: ['Split', 'Cassette', 'Ducted', 'Multi-Split', 'VRF/VRV', 'Packaged/Rooftop', 'AHU/FCU', 'Universal', 'Not Applicable'],
    default: 'Not Applicable'
  },
  refrigerants: [{ type: String, trim: true }],
  capacityBtu: { type: Number, min: 0 },
  voltage: { type: String, default: '', trim: true },
  phase: { type: String, enum: ['Single Phase', 'Three Phase', 'Not Applicable'], default: 'Not Applicable' },
  available: { type: Number, default: 0, min: 0 },
  reserved: { type: Number, default: 0, min: 0 },
  location: { type: String, default: DEFAULT_LOCATION.warehouse, trim: true },
  binLocation: { type: String, default: DEFAULT_LOCATION.placementAreas[0], trim: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  unit: { type: String, default: 'units' },
  reorderLevel: { type: Number, default: 10, min: 0 },
  maxStockLevel: { type: Number, default: 100, min: 0 },
  unitCost: { type: Number, default: 0, min: 0 },
  pricing: {
    costPerUnit: { type: Number, min: 0 },
    profitMargin: { type: Number, min: 0 },
    sellingPricePerUnit: { type: Number, min: 0 },
  },
  isSerialized: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  serialNumbers: [{ type: String, trim: true }],
  specsUrl: { type: String },
  status: { type: String, enum: ['critical', 'warning', 'normal'], default: 'normal' },
}, {
  timestamps: true,
  collection: 'inventory', // Ensuring singular/specific naming as per previous instructions
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

InventorySchema.virtual('stockStatus').get(function stockStatusVirtual() {
  return deriveStockStatus(this.available, this.reorderLevel);
});

InventorySchema.pre('validate', function synchronizeInventoryCompatibility() {
  this.itemClass = this.itemClass || 'Unclassified';
  this.subcategory = this.subcategory || 'Unclassified';
  this.category = this.itemClass;
  this.status = legacyStockStatus(this.available, this.reorderLevel);
  this.pricing = this.pricing || {};
  this.pricing.costPerUnit = Number(this.unitCost || 0);
  const serials = (this.serialNumbers || []).map((serial) => String(serial).trim()).filter(Boolean);
  if (new Set(serials).size !== serials.length) {
    this.invalidate('serialNumbers', 'Serial numbers must be unique within an inventory item');
  }
  this.serialNumbers = serials;
  if ((this.isNew || this.isModified('location') || this.isModified('binLocation'))
    && !isValidInventoryLocation(this.location, this.binLocation)) {
    this.invalidate('binLocation', 'Select a placement area belonging to the selected warehouse');
  }
});

module.exports = mongoose.models.ManagerInventoryItem
  || mongoose.model('ManagerInventoryItem', InventorySchema);
