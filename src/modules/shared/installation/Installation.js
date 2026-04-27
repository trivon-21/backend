const mongoose = require('mongoose');
const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
  DEFAULTS,
} = require('../../../constants/enums');

const installationSchema = new mongoose.Schema({
  ticketId: {
    type: Number,
    default: null
  },
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  inspectionReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InspectionReport',
    default: null
  },
  productType: String,
  units: { type: Number, default: 1 },
  location: String,
  serviceDate: Date, // Date requested/reported
  date: Date,        // Date scheduled by CSA
  siteDetails: {
    buildingType: String,
    floors: Number,
    rooms: Number,
    ceilingHeight: String,
    wallType: String,
    powerSupply: String,
    outdoorAccess: String
  },
  
  // Expanded Lifecycle Statuses
  status: {
    type: String,
    enum: [
      WORKFLOW_STATUS.NEW,
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

  // Data from Inspection Report
  materials: [{
    item: String,
    quantity: String
  }],
  labour: {
    technicians: Number,
    helpers: Number,
    duration: String
  },
  financeNotes: String,
  reviewNotes: String,
  inspectionSnapshot: {
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
      status: String
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
    }]
  },
  
  assignedTeam: {
    type: mongoose.Schema.Types.Mixed,
    ref: 'TechTeam'
  },
  assignedTeamId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  assignedTeamName: {
    type: String,
    default: DEFAULTS.UNASSIGNED
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Installation', installationSchema, 'Installations');