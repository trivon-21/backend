const mongoose = require('mongoose');
const { Schema } = mongoose;

const inspectionReportSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'InspectionTicket', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'InstallationOrder' },
    inspectorId: { type: Schema.Types.ObjectId, ref: 'User' },
    customerName: String,
    contactNumber: String,
    siteAddress: String,
    siteType: String,
    inspectionDate: String,
    siteStatus: String,
    floorLevel: String,
    elevatorAvailability: Boolean,
    parkingAvailability: String,
    rooms: [Schema.Types.Mixed],
    photos: [{ name: String, dataUrl: String }],
    inspectorName: String,
    acknowledgeDate: String,
    acknowledgeTime: String,
    status: { type: String, enum: ['DRAFT', 'RECORDED', 'SUBMITTED'], default: 'DRAFT' },
    submittedAt: Date,
    recordedAt: Date,
  },
  { timestamps: true, collection: 'inspection_reports' }
);

module.exports = mongoose.models.InspectionReport || mongoose.model('InspectionReport', inspectionReportSchema);