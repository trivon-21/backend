const mongoose = require('mongoose');
const { Schema } = mongoose;

const inspectionReportSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'InspectionTicket', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'InstallationOrder' },
    inspectorId: { type: Schema.Types.ObjectId, ref: 'User' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User' },
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
    status: { type: String, enum: ['DRAFT', 'RECORDED', 'SUBMITTED', 'Approved', 'Rejected'], default: 'DRAFT' },
    submittedAt: Date,
    recordedAt: Date,
    reportId: { type: String, unique: true, sparse: true }
  },
  { timestamps: true, collection: 'inspection_reports' }
);

inspectionReportSchema.pre('save', async function (next) {
  if (this.isNew && !this.reportId) {
    try {
      const CounterModel = mongoose.model('Counter');
      let counter = await CounterModel.findOneAndUpdate(
        { _id: 'inspectionReportId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      if (!counter) {
        await CounterModel.updateOne({ _id: 'inspectionReportId' }, { $set: { seq: 1000 } }, { upsert: true });
        counter = { seq: 1000 };
      } else if (counter.seq < 1000) {
        counter = await CounterModel.findOneAndUpdate({ _id: 'inspectionReportId' }, { $set: { seq: 1000 } }, { new: true });
      }
      this.reportId = `IREP-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.models.InspectionReport || mongoose.model('InspectionReport', inspectionReportSchema);