const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  itemClass: {
    type: String,
    enum: ["AC Equipment", "Spare Parts", "Installation Materials", "Consumables", "Tools and Test Equipment", "Kits and Bundles", "Unclassified"],
    default: "Unclassified",
  },
  unit: { type: String, default: "units" },
  unitCost: { type: Number, default: 0 },
  available: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
  pricing: {
    costPerUnit: Number,
    profitMargin: { type: Number, default: 0.25 },
    sellingPricePerUnit: Number,
  },
}, { timestamps: true, strict: false });

const Inventory = mongoose.models.Inventory
  || mongoose.model("Inventory", inventorySchema, "inventory");

if (!mongoose.models.L_Inventory) {
  mongoose.model("L_Inventory", inventorySchema, "inventory");
}

module.exports = Inventory;