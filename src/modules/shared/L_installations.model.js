const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema({
  item: { type: String, required: true },
  quantity: { type: String, required: true },
});

const siteDetailsSchema = new mongoose.Schema({
  buildingType: { type: String, default: "" },
  floors: { type: Number, default: 1 },
  rooms: { type: Number, default: 1 },
  ceilingHeight: { type: String, default: "" },
  wallType: { type: String, default: "" },
  powerSupply: { type: String, default: "" },
  outdoorAccess: { type: Boolean, default: false },
}, { _id: false });

const lInstallationSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  inspectionTicketId: { type: mongoose.Schema.Types.ObjectId, ref: "InspectionTicket", default: null },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedTeamId: { type: mongoose.Schema.Types.ObjectId, default: null },
  assignedTeamName: { type: String, default: "" },
  productType: { type: String, default: "" },
  units: { type: Number, default: 1 },
  location: { type: String, default: "" },
  serviceDate: { type: Date, default: null },
  siteDetails: { type: siteDetailsSchema, default: () => ({}) },
  materials: { type: [materialSchema], default: [] },
  financeNotes: { type: String, default: "" },
  status: {
    type: String,
    enum: ["Pending", "Assigned", "In Progress", "Completed", "Cancelled"],
    default: "Pending",
  },
}, { timestamps: true, strict: false });

const Installation = mongoose.models.Installation || mongoose.model("Installation", lInstallationSchema, "installations");
if (!mongoose.models.L_Installation) {
  mongoose.model("L_Installation", lInstallationSchema, "installations");
}

module.exports = Installation;