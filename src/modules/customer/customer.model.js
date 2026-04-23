// src/models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  // No need to define _id, MongoDB does it automatically
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  contactNo: { type: String, required: true },
  address: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, {
  // This helper makes the _id appear as 'id' in JSON responses for your Angular frontend
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Customer', customerSchema, 'Customers');