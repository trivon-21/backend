const mongoose = require('mongoose');

const newRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    ticketId: { type: String, default: '' },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    productType: { type: String, default: '' },
    serviceType: { type: String, enum: ['Maintenance', 'Repair'], default: 'Repair' },
    serviceDescription: { type: String, default: '' },
    description: { type: String, default: '' },
    location: { type: String, default: '' },
    preferredServiceDate: { type: Date, default: null }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

module.exports = mongoose.model('NewRequest', newRequestSchema, 'NewRequests');
