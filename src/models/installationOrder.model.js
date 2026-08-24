const mongoose = require('mongoose');

const InstallationOrderSchema = new mongoose.Schema({
  orderReference: {
    type: String,
    unique: true,
    required: true
  },
  orderId: {
    type: String,
    unique: true
  },
  userId: {
    type: String,
    required: true
  },
  items: [
    {
      productId: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      quantity: { type: Number, required: true, min: 1 },
      purchaseType: {
        type: String,
        default: 'buy_and_install'
      }
    }
  ],
  shippingDetails: {
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    postalCode: { type: String, default: '' }
  },
  subtotal: { type: Number, required: true },
  additionalCharges: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Pending Review', 'Awaiting Quote', 'Awaiting Inspection', 'Confirmed', 'Cancelled'],
    default: 'Pending Review'
  },
  inspectionFee: { type: Number, default: 0 },
  paymentSlip: { type: String, default: '' },
  paymentSlipUrl: { type: String, default: '' },
  paymentStatus: { type: String, default: 'Pending' },
  consultationCompleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('InstallationOrder', InstallationOrderSchema);
