const mongoose = require("mongoose");

const lSellingPriceSchema = new mongoose.Schema({
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "L_Inventory", required: true, unique: true },
  inventoryName: { type: String, default: "" },
  costPerUnit: { type: Number, required: true },
  profitMargin: { type: Number, default: 0.25 },
  sellingPricePerUnit: { type: Number, required: true },
}, { timestamps: true });

lSellingPriceSchema.pre("save", function (next) {
  this.sellingPricePerUnit = Math.round(this.costPerUnit * (1 + this.profitMargin));
  next();
});

const SellingPrice = mongoose.models.SellingPrice || mongoose.model("SellingPrice", lSellingPriceSchema, "l_sellingprices");
if (!mongoose.models.L_SellingPrice) {
  mongoose.model("L_SellingPrice", lSellingPriceSchema, "l_sellingprices");
}

module.exports = SellingPrice;