const mongoose = require('mongoose');

const LogisticsSchema = new mongoose.Schema({
  label: { type: String, required: true },
  current: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  subLabel: { type: String }
}, { 
  timestamps: true,
  collection: 'logistics'
});

module.exports = mongoose.model('Logistics', LogisticsSchema);
