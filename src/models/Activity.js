const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  type: { type: String, enum: ['return', 'dispatch', 'request', 'grn', 'alert'], required: true },
  title: { type: String, required: true },
  description: { type: String },
  timestamp: { type: Date, default: Date.now },
  actionLabel: { type: String },
  actionUrl: { type: String }
}, { 
  timestamps: true,
  collection: 'activities'
});

module.exports = mongoose.model('Activity', ActivitySchema);
