// src/models/ServiceReport.js
const mongoose = require('mongoose');
const { EXECUTION_STATUS } = require('../../constants/enums');
require('../../models/counter.model');

const serviceReportSchema = new mongoose.Schema({
  serviceReportId: { type: String, unique: true },
  // Dynamic linking to the original job source
  serviceRequestId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true,
    refPath: 'onModel' 
  },
  onModel: {
    type: String,
    required: true,
    enum: ['ServiceRequest', 'Installation', 'Maintenance'] // Supports all request types
  },
  serviceType: { type: String, trim: true, maxlength: 100, default: 'Repair' }, 
  teamName: { type: String, trim: true, maxlength: 100 },
  customer: {
    name: String, fullName: String, phone: String, email: String, address: String
  },
  location: { type: String, trim: true, maxlength: 500 },
  scheduledDate: Date,
  productDetails: {
    generalType: String, detailedType: String, description: String
  },
  materialsUsed: [{ item: String, quantity: String }],
  notesFromMainTechnician: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
  technicianComment: { type: String, trim: true, maxlength: 2000 },
  reviewNotes: { type: String, trim: true, maxlength: 2000 },
  finalStatus: {
    type: String,
    trim: true,
    enum: ['Pending', 'Reviewed', 'Approved', 'Rejected', EXECUTION_STATUS.COMPLETED],
    default: EXECUTION_STATUS.COMPLETED,
  },
  submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

serviceReportSchema.pre('save', async function () {
  if (this.isNew && !this.serviceReportId) {
    const CounterModel = mongoose.model('Counter');
    let counter = await CounterModel.findOneAndUpdate(
      { _id: 'serviceReportId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    if (!counter || counter.seq < 1000) {
      counter = await CounterModel.findOneAndUpdate(
        { _id: 'serviceReportId' },
        { $set: { seq: 1000 } },
        { new: true, upsert: true }
      );
    }
    this.serviceReportId = `SREP-${String(counter.seq).padStart(4, '0')}`;
  }
});


serviceReportSchema.index({ serviceRequestId: 1, onModel: 1 }, { unique: true });

module.exports = mongoose.model('service_reports', serviceReportSchema, 'service_reports');
