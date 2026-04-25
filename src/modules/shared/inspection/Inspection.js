// src/models/Inspection.js
const mongoose = require('mongoose');

const inspectionSchema = new mongoose.Schema({
  // Foreign Key linking to the Customers collection
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  location: { type: String, required: true },
  serviceDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['Assigned', 'Scheduled', 'In Progress', 'Completed', 'On Hold'],
    default: 'Assigned'
  },
  // Reference to the technical team assigned to the job
  assignedTeam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TechTeam'
  }
}, { 
  timestamps: true, // Automatically manages createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.models.Inspection || mongoose.model('Inspection', inspectionSchema, 'Inspections');