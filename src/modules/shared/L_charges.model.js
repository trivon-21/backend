const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  name:        { type: String, trim: true },
  amount:      { type: Number },
  type:        { type: String, enum: ["FIXED", "PERCENTAGE"], default: "FIXED" },
  description: { type: String, default: "" },
}, { strict: false, timestamps: true });

const Charge = mongoose.models.Charge
  || mongoose.model("Charge", schema, "charges");

if (!mongoose.models.L_Charge) {
  mongoose.model("L_Charge", schema, "charges");
}

module.exports = Charge;