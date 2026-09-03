const mongoose = require('mongoose');
const { Schema } = mongoose;

const repairSchema = new Schema(
  {
    serviceRequestRef: { type: String, unique: true, sparse: true },
    serviceTicketId: { type: Schema.Types.ObjectId, ref: 'ServiceTicket' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    repairType: { type: String, enum: ['minor', 'major'] },
    materials: [{ item: String, itemName: String, inventoryId: String, quantity: Number }],
    location: String,
    notes: String,
    description: String,
    acUnitModel: String,
    productType: String,
    status: {
      type: String,
      enum: ['PENDING', 'MATERIALS_READY', 'INVOICED', 'Pending', 'Finance Approved', 'Finance Rejected',
        'Sent to IM', 'Materials Ready', 'Assigned', 'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'PENDING'
    },
  },
  { timestamps: true, collection: 'repairs', strict: false }
);

module.exports = mongoose.models.Repair || mongoose.model('Repair', repairSchema);
