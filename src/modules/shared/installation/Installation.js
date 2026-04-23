const mongoose = require('mongoose');

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
      'Pending', 'Finance Approved', 'Finance Rejected', 'Cancelled', 'Sent to IM', 
      'Assigned', 'Scheduled', 'In Progress', 'On Hold', 'Completed'
    ],
    default: 'Pending'
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
  
  assignedTeam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TechTeam'
  },
  assignedTeamId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  assignedTeamName: {
    type: String,
    default: 'Unassigned'
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Installation', installationSchema, 'Installations');