// src/models/ServiceRequest.js
const mongoose = require('mongoose');
const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
} = require('../../../constants/enums');

const serviceRequestSchema = new mongoose.Schema({
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  productType: String,
  serviceDescription: String,
  location: String,
  serviceDate: Date,
  
  status: {
    type: String,
    enum: [
      WORKFLOW_STATUS.PENDING,
      WORKFLOW_STATUS.FINANCE_APPROVED,
      WORKFLOW_STATUS.FINANCE_REJECTED,
      WORKFLOW_STATUS.CANCELLED,
      WORKFLOW_STATUS.SENT_TO_IM,
      EXECUTION_STATUS.ASSIGNED,
      EXECUTION_STATUS.SCHEDULED,
      EXECUTION_STATUS.IN_PROGRESS,
      EXECUTION_STATUS.ON_HOLD,
      EXECUTION_STATUS.COMPLETED,
    ],
    default: WORKFLOW_STATUS.PENDING
  },

  // Warranty & Materials
  isUnderWarranty: { type: Boolean, default: false },
  isFreeOfCharge: { type: Boolean, default: false },
  materials: [{
    item: String,
    quantity: String
  }],
  financeNotes: String,

  // Team & Progress
  assignedTeam: { type: mongoose.Schema.Types.Mixed, ref: 'TechTeam' },
  assignedTeamId: mongoose.Schema.Types.Mixed,
  assignedTeamName: String,
  timeline: {
    startDate: Date,
    estimatedCompletion: Date
  },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema, 'ServiceRequests');