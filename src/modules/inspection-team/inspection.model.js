// src/models/InspectionReport.js
const mongoose = require('mongoose');

const inspectionReportSchema = new mongoose.Schema({
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  status: {
    type: String,
    enum: ['Pending', 'Reviewed', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  siteDetails: {
    buildingType: String,
    floors: Number,
    rooms: Number,
    ceilingHeight: String,
    wallType: String,
    powerSupply: String,
    outdoorAccess: String
  },
  inspectionMeta: {
    team: String,
    date: Date,
    time: String,
    notes: String,
    recommendedProducts: [String]
  },
  findings: [{
    category: String,
    description: String,
    status: { type: String, enum: ['Good', 'Needs Attention'] }
  }],
  requirements: {
    materials: [{
      item: String,
      quantity: String
    }],
    labour: {
      technicians: Number,
      helpers: Number,
      duration: String
    }
  },
  photos: [{
    url: String,
    caption: String
  }],
  reviewNotes: String
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('InspectionReport', inspectionReportSchema, 'InspectionReports');
