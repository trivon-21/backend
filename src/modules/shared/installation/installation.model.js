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
<<<<<<< HEAD
    status: { type: String, enum: ['Pending','Approved','Sent to IM', 'Assigned', 'In Progress', 'Completed', 'Cancelled', 'On Hold'], default: 'Pending' },
    paymentStatus: { type: String, enum: ['NEW','PENDING_PAYMENT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] },
=======
    status: {
      type: String,
      enum: ['Pending', 'Finance Approved', 'Finance Rejected', 'Sent to IM', 'Materials Ready', 'Assigned',
        'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'Pending'
    },
>>>>>>> origin/dev-new
  },
  { timestamps: true, collection: 'installations' }
);

module.exports = mongoose.models.Installation || mongoose.model('Installation', installationSchema);
