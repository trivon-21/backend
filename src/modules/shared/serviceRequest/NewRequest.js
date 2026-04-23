const mongoose = require('mongoose');

const newRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true
    },
    productType: { type: String, default: '' },
    serviceDescription: { type: String, default: '' },
    location: { type: String, default: '' }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

module.exports = mongoose.model('NewRequest', newRequestSchema, 'NewRequests');
