const mongoose = require("mongoose");

const lInventorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ["Piping", "Electrical", "Mounting", "Drainage", "Safety", "Tools", "Consumables", "Other"],
    default: "Other",
  },
  unit: { type: String, default: "unit" },
  costPerUnit: { type: Number, required: true, min: 0 },
  description: { type: String, default: "" },
  inStock: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("L_Inventory", lInventorySchema);