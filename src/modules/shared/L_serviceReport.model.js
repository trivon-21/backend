const mongoose = require("mongoose");

const materialUsedSchema = new mongoose.Schema({
  item: { type: String, required: true },
  quantity: { type: mongoose.Schema.Types.Mixed, required: true },
}, { _id: true });

const lServiceReportSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  customer: {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
  },
  type: {
    type: String,
    enum: ["MAINTENANCE", "REPAIR"],
    required: true,
  },
  repairType: {
    type: String,
    enum: ["MINOR", "MAJOR", null],
    default: null,
  },
  units: { type: Number, default: 1, min: 1 },
  productDetails: {
    generalType: { type: String, default: "" },
    detailedType: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  location: { type: String, default: "" },
  scheduledDate: { type: Date, default: null },
  materialsUsed: { type: [materialUsedSchema], default: [] },
  notesFromMainTechnician: { type: String, default: "" },
  technicianComment: { type: String, default: "" },
  finalStatus: {
    type: String,
    enum: ["Pending", "In Progress", "Completed", "Cancelled"],
    default: "Pending",
  },
  submittedAt: { type: Date, default: null },
}, { timestamps: true, strict: false });

const ServiceReport = mongoose.models.ServiceReport || mongoose.model("ServiceReport", lServiceReportSchema, "service_reports");
if (!mongoose.models.L_ServiceReport) {
  mongoose.model("L_ServiceReport", lServiceReportSchema, "service_reports");
}

module.exports = ServiceReport;