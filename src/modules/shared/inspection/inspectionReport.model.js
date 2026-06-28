const mongoose = require('mongoose');
const { INSPECTION_REVIEW_STATUS } = require('../../../constants/enums');

const inspectionReportSchema = new mongoose.Schema({
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  status: {
    type: String,
    enum: [
      INSPECTION_REVIEW_STATUS.PENDING,
      INSPECTION_REVIEW_STATUS.REVIEWED,
      INSPECTION_REVIEW_STATUS.APPROVED,
      INSPECTION_REVIEW_STATUS.REJECTED,
    ],
    default: INSPECTION_REVIEW_STATUS.PENDING
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
