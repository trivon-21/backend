const mongoose = require("mongoose");

const repairMaterialSchema = new mongoose.Schema({
  item: String,
  quantity: mongoose.Schema.Types.Mixed,
});

const lRepairSchema = new mongoose.Schema({
  serviceTicketId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceTicket" },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  repairType: { type: String, enum: ["minor", "major"], default: "minor" },
  materials: [repairMaterialSchema],
  location: String,
  notes: String,
  status: {
    type: String,
    enum: ["PENDING", "MATERIALS_READY", "INVOICED"],
    default: "PENDING",
  },
}, { strict: false, timestamps: true });

const Repair = mongoose.models.Repair || mongoose.model("Repair", lRepairSchema, "repairs");
if (!mongoose.models.L_Repair) {
  mongoose.model("L_Repair", lRepairSchema, "repairs");
}

module.exports = Repair;