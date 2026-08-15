const mongoose = require("mongoose");

const lChargeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  amount: { type: Number, required: true },
  type: {
    type: String,
    enum: ["FIXED", "PERCENTAGE"],
    default: "FIXED",
  },
  description: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("L_Charge", lChargeSchema);