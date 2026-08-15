const mongoose = require("mongoose");

const repairMaterialSchema = new mongoose.Schema({
  item:     String,
  quantity: mongoose.Schema.Types.Mixed,
});

const lRepairSchema = new mongoose.Schema({
  serviceTicketId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceTicket" },
  customerId:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  orderId:         { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  repairType:      { type: String, enum: ["minor", "major"], default: "minor" },
  materials:       [repairMaterialSchema],
  location:        String,
  notes:           String,
  status: {
    type: String,
    enum: ["PENDING", "MATERIALS_READY", "INVOICED"],
    default: "PENDING",
  },
}, { strict: false, timestamps: true });

module.exports = mongoose.model("L_Repair", lRepairSchema);