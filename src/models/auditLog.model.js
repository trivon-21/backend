const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['UPDATE_BANK_DETAILS']
  },
  resource: {
    type: String,
    required: true,
    default: 'PaymentSetting'
  },
  before: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  after: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { 
  collection: 'auditlogs' 
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
