const mongoose = require('mongoose');
const { Schema } = mongoose;

const repairSchema = new Schema(
  {
    serviceTicketId: { type: Schema.Types.ObjectId, ref: 'ServiceTicket' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    repairType: { type: String, enum: ['minor', 'major'] },
    materials: [{ item: String, quantity: Number }],
    location: String,
    notes: String,
    paymentStatus: { type: String, enum: ['NEW','PENDING_PAYMENT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] },
    status: { type: String, enum: ['PENDING', 'Approved','Sent to IM','MATERIALS_READY', 'INVOICED', 'In Progress', 'On Hold', 'Completed'], default: 'PENDING' },
  },
  { timestamps: true, collection: 'repairs' }
);

module.exports = mongoose.models.ServiceRequest || mongoose.models.Repair || mongoose.model('Repair', repairSchema);
