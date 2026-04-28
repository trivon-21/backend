const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    // User who performed the action
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    performedByRole: {
      type: String,
      enum: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CSA', 'FINANCE', 'INVENTORY_MANAGER', 'INSPECTION_TEAM', 'SERVICE_TEAM', 'TECHNICIAN', 'SALES', 'CUSTOMER', 'SYSTEM', 'UNKNOWN'],
      required: true,
    },

    // Log categorization
    logType: {
      type: String,
      enum: ['ACTIVITY', 'ERROR', 'SECURITY'],
      default: 'ACTIVITY',
      required: true,
    },
    logLevel: {
      type: String,
      enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'],
      default: 'INFO',
      required: true,
    },
    module: {
      type: String,
      enum: [
        'AUTH',
        'USER_MANAGEMENT',
        'SYSTEM_CONFIG',
        'ORDER_MANAGEMENT',
        'CUSTOMER_SERVICE',
        'PAYMENT',
        'FINANCE',
        'INVENTORY',
        'INSPECTION',
        'SERVICE_TEAM',
        'TECHNICIAN',
        'SALES',
        'DASHBOARD',
        'REPORTS',
        'AUDIT',
        'OTHER',
      ],
      required: true,
    },

    // Action details
    action: {
      type: String,
      required: true,
    },
    actionCategory: {
      type: String,
      enum: [
        'CREATE',
        'READ',
        'UPDATE',
        'DELETE',
        'LOGIN',
        'LOGOUT',
        'AUTHORIZE',
        'UNAUTHORIZED_ATTEMPT',
        'FAILED_LOGIN',
        'SUSPICIOUS_ACTIVITY',
        'EXPORT',
        'IMPORT',
        'PAYMENT',
        'VERIFICATION',
        'APPROVAL',
        'REJECTION',
        'CONFIGURATION',
        'OTHER',
      ],
      required: true,
    },

    // Entity being acted upon
    entity: {
      type: String,
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // Change details
    changes: {
      before: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      after: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    reason: {
      type: String,
      default: null,
    },

    // Request details
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },

    // Status and error information
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
      default: 'SUCCESS',
    },
    statusCode: {
      type: Number,
      default: null,
    },

    // Error details (for ERROR and SECURITY logs)
    errorDetails: {
      errorType: {
        type: String,
        default: null,
      },
      errorMessage: {
        type: String,
        default: null,
      },
      stackTrace: {
        type: String,
        default: null,
      },
      affectedResource: {
        type: String,
        default: null,
      },
    },

    // Security details (for SECURITY logs)
    securityDetails: {
      attemptCount: {
        type: Number,
        default: null,
      },
      riskLevel: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        default: null,
      },
      securityFlags: [String],
    },

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Request/Response details (optional)
    requestDetails: {
      method: String,
      endpoint: String,
      params: mongoose.Schema.Types.Mixed,
    },

    // Data size for large operations
    dataSize: {
      type: Number,
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

// Create indexes for efficient querying and filtering
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ performedByRole: 1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ logType: 1 });
auditLogSchema.index({ module: 1 });
auditLogSchema.index({ actionCategory: 1 });
auditLogSchema.index({ status: 1 });
auditLogSchema.index({ createdAt: -1, logType: 1, module: 1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ performedByRole: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
