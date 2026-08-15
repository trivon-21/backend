const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderReference: {
    type: String,
    unique: true
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
        enum: ['buy_only', 'buy_and_install'],
        default: 'buy_only'
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
  paymentSlipUrl: { type: String },
  status: {
    type: String,
    enum: ['Pending Payment', 'Under Review (Finance)', 'Confirmed', 'Cancelled'],
    default: 'Pending Payment'
  },
  consultationCompleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
