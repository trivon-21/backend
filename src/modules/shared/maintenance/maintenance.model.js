const mongoose = require('mongoose');
const { Schema } = mongoose;
require('../../../models/counter.model');

const maintenanceSchema = new Schema(
  {
    ticketId: { type: String, required: true, unique: true }, // e.g. MS-0001
    maintenanceType: { type: String, enum: ['Company Initiated', 'Customer Initiated'] },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isUnderWarranty: { type: Boolean, default: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['New', 'Pending', 'Finance Approved', 'Finance Rejected', 'Sent to IM', 'Materials Ready', 'Assigned',
        'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'New'
    },
    materialList: [{ item: String, quantity: Number, estimatedCost: Number }],
    assignedTeamId: { type: Schema.Types.ObjectId, ref: 'TechTeam' },
    serviceReport: { technicianNotes: String, submittedAt: Date, photos: [String] },
    paymentSlipUrl: { type: String, default: null },       
    paymentAmount: { type: Number, default: 0 },
    description: String,
    acUnitModel: String,
    productType: String,
  },
  { timestamps: true, collection: 'maintenances', strict: false }
);

maintenanceSchema.pre('validate', async function () {
  if (!this.isNew || this.ticketId) return;

  const CounterModel = mongoose.model('Counter');
  const counter = await CounterModel.findOneAndUpdate(
    { _id: 'serviceTicket' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  this.ticketId = `SRQ-${String(counter.seq).padStart(4, '0')}`;
});

module.exports = mongoose.model('Maintenance', maintenanceSchema);
