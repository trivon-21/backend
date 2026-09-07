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
  serviceType: { type: String, default: 'Repair' }, 
  teamName: String,
  customer: {
    name: String, fullName: String, phone: String, email: String, address: String
  },
  location: String,
  scheduledDate: Date,
  productDetails: {
    generalType: String, detailedType: String, description: String
  },
  materialsUsed: [{ item: String, quantity: String }],
  notesFromMainTechnician: String,
  technicianComment: String, 
  reviewNotes: String,
  finalStatus: { type: String, default: EXECUTION_STATUS.COMPLETED },        
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


module.exports = mongoose.model('service_reports', serviceReportSchema, 'service_reports');
