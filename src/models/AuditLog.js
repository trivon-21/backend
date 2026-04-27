const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: [
        'CREATE_CONFIG',
        'UPDATE_BUSINESS_RULES',
        'UPDATE_FEATURE_FLAGS',
        'UPDATE_MAINTENANCE_MODE',
        'UPDATE_SYSTEM_INFO',
      ],
      required: true,
    },
    entity: {
      type: String,
      default: 'SYSTEM_CONFIG',
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SystemConfig',
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    reason: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  }
);

// Create indexes for efficient querying
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
