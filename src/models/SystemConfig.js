const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    businessRules: {
      quotationApprovalThreshold: {
        type: Number,
        default: 1000000,
        min: 0,
        max: 10000000,
      },
      paymentAutoCancelDays: {
        type: Number,
        default: 14,
        min: 1,
        max: 365,
      },
      defaultWarrantyMonths: {
        type: Number,
        default: 24,
        min: 1,
        max: 60,
      },
      amcContractMonths: {
        type: Number,
        default: 12,
        min: 1,
        max: 60,
      },
      maxRescheduleAttempts: {
        type: Number,
        default: 3,
        min: 1,
        max: 10,
      },
    },
    featureFlags: {
      amcModuleEnabled: {
        type: Boolean,
        default: true,
      },
      warrantyModuleEnabled: {
        type: Boolean,
        default: true,
      },
      customerFeedbackEnabled: {
        type: Boolean,
        default: true,
      },
      deliveryTrackingEnabled: {
        type: Boolean,
        default: true,
      },
    },
    maintenance: {
      isActive: {
        type: Boolean,
        default: false,
      },
      message: {
        type: String,
        default: 'System is under maintenance. Please try again later.',
      },
      reason: {
        type: String,
        default: '',
      },
      startTime: {
        type: Date,
        default: null,
      },
      endTime: {
        type: Date,
        default: null,
      },
      scheduledStartTime: {
        type: Date,
        default: null,
      },
      scheduledEndTime: {
        type: Date,
        default: null,
      },
    },
    systemInfo: {
      systemName: {
        type: String,
        default: 'AirLux',
        maxlength: 100,
      },
      supportEmail: {
        type: String,
        default: 'support@airlux.lk',
        match: /.+\@.+\..+/,
      },
      supportPhoneNumber: {
        type: String,
        default: '+94 11 234 5678',
      },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
