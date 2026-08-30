const mongoose = require('mongoose');
const { Schema } = mongoose;

const installationSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'InstallationOrder' },
    inspectionTicketId: { type: Schema.Types.ObjectId, ref: 'InspectionTicket' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTeamId: { type: Schema.Types.ObjectId, ref: 'TechTeam' }, 
    assignedTeamName: String, // denormalized display copy, optional
    productType: String,
    units: { type: Number, default: 1 },
    location: String,
    serviceDate: Date,
    siteDetails: {
      buildingType: String,
      floors: Number,
      rooms: Number,
      ceilingHeight: String,
      wallType: String,
      powerSupply: String,
      outdoorAccess: Boolean,
    },
    materials: [{ item: String, quantity: Number }],
    financeNotes: String,
    status: {
      type: String,
      enum: ['Pending', 'Finance Approved', 'Finance Rejected', 'Sent to IM', 'Materials Ready', 'Assigned',
        'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'Pending'
    },
  },
  { timestamps: true, collection: 'installations' }
);

module.exports = mongoose.models.Installation || mongoose.model('Installation', installationSchema);
