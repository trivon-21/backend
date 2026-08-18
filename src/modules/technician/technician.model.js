// src/models/ServiceReport.js
const mongoose = require('mongoose');
const { EXECUTION_STATUS } = require('../../constants/enums');

const serviceReportSchema = new mongoose.Schema({
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

module.exports = mongoose.model('service_reports', serviceReportSchema, 'service_reports');
