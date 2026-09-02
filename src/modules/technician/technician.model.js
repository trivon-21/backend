// src/models/ServiceReport.js
const mongoose = require('mongoose');
const { EXECUTION_STATUS } = require('../../constants/enums');

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
    enum: ['ServiceRequest', 'Installation'] // Supports both request types
  },
  serviceType: { type: String, default: 'Repair' }, 
  teamName: String,
  customer: {
    name: String, phone: String, email: String, address: String
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

serviceReportSchema.pre('save', async function (next) {
  if (this.isNew && !this.serviceReportId) {
    try {
      const CounterModel = mongoose.model('Counter');
      let counter = await CounterModel.findOneAndUpdate(
        { _id: 'serviceReportId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      if (!counter) {
        counter = await CounterModel.updateOne({ _id: 'serviceReportId' }, { $set: { seq: 1000 } }, { upsert: true });
      } else if (counter.seq < 1000) {
        counter = await CounterModel.findOneAndUpdate({ _id: 'serviceReportId' }, { $set: { seq: 1000 } }, { new: true });
      }
      this.serviceReportId = `REP-${counter.seq}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('service_reports', serviceReportSchema, 'service_reports');
