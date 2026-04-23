// src/models/ServiceRequest.js
const mongoose = require('mongoose');

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
      'Pending', 'Finance Approved', 'Finance Rejected', 'Cancelled', 'Sent to IM', 
      'Assigned', 'Scheduled', 'In Progress', 'On Hold', 'Completed'
    ],
    default: 'Pending'
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
  assignedTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'TechTeam' },
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