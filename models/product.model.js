const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: "LKR" },
  inStock: { type: Boolean, default: true },
  capacityOptions: [
    {
      label: String,
      price: Number,
    },
  ],
  description: String,
  features: [String],
  specifications: [
    {
      label: String,
      value: String,
    },
  ],
  warrantyTerms: [
    {
      title: String,
      description: String,
    },
  ],
  warrantyCovered: [String],
  warrantyNotCovered: [String],
  images: [String],
});

module.exports = mongoose.model("Product", productSchema);
