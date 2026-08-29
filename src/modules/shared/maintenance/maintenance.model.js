const mongoose = require('mongoose');
const { Schema } = mongoose;

const maintenanceSchema = new Schema(
  {
    ticketId: { type: String, required: true, unique: true }, // e.g. MS-0001-ACT
    maintenanceType: { type: String, enum: ['Company Initiated', 'Customer Initiated'] },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isUnderWarranty: { type: Boolean, default: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['New', 'Approved','Sent to IM','Assigned','Scheduled', 'In Progress', 'Completed', 'On Hold'], default: 'New' },
    paymentStatus: { type: String, enum: ['NEW','PENDING_PAYMENT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] },
    materialList: [{ item: String, quantity: Number, estimatedCost: Number }],
    assignedTeamId: { type: Schema.Types.ObjectId, ref: 'TechTeam' },
    serviceReport: { technicianNotes: String, submittedAt: Date, photos: [String] },
  },
  { timestamps: true, collection: 'maintenances' }
);

module.exports = mongoose.model('Maintenance', maintenanceSchema);
