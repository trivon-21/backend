const mongoose = require('mongoose');

const BankDetailSchema = new mongoose.Schema({
  accountNumber: {
    type: String,
    required: [true, 'Account number is required'],
    trim: true
  },
  bankName: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  accountName: {
    type: String,
    required: [true, 'Account holder name is required'],
    trim: true
  },
  branch: {
    type: String,
    required: [true, 'Branch name is required'],
    trim: true
  },
  currency: {
    type: String,
    default: 'LKR'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  }
}, {
  timestamps: true,
  collection: 'bank_details'
});

const BankDetail = mongoose.models.BankDetail || mongoose.model('BankDetail', BankDetailSchema, 'bank_details');
module.exports = BankDetail;
