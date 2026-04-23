const mongoose = require('mongoose');


const materialRequestSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  requestType: { type: String, default: 'Service' },
  customerId: mongoose.Schema.Types.ObjectId,
  customerName: String,
  customerEmail: String,
  customerContactNo: String,
  customerAddress: String,
  location: String,
  serviceDate: Date,
  serviceDescription: String,
  status: {
    type: String,
    enum: ['New', 'Pending', 'Finance Approved', 'Finance Rejected', 'Cancelled', 'Sent to IM'],
    default: 'New'
  },
  materials: [{
    item: { type: String, required: true },
    quantity: { type: String, required: true }
  }],
  financeNotes: String,
  isUnderWarranty: { type: Boolean, default: false },
  isFreeOfCharge: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MaterialRequest', materialRequestSchema, 'MaterialRequests');
