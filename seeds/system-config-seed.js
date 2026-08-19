/**
 * Seed script to initialize SystemConfig with default values
 * Run: npm run seed:config
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SystemConfig = require('../src/models/SystemConfig');

async function seedSystemConfig() {
  try {
    // Connect to the shared team database configured in the environment.
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/airlux';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if config already exists
    let config = await SystemConfig.findOne();

    if (config) {
      console.log('SystemConfig already exists. Skipping seed.');
      process.exit(0);
    }

    // Create default SystemConfig
    config = await SystemConfig.create({
      businessRules: {
        quotationApprovalThreshold: 1000000,
        logRetentionDays: 30,
        paymentAutoCancelDays: 14,
        defaultWarrantyMonths: 24,
        amcContractMonths: 12,
        maxRescheduleAttempts: 3,
      },
      featureFlags: {
        amcModuleEnabled: true,
        warrantyModuleEnabled: true,
        customerFeedbackEnabled: true,
        deliveryTrackingEnabled: true,
      },
      maintenance: {
        isActive: false,
        message: 'System is under maintenance. Please try again later.',
        reason: '',
        startTime: null,
        endTime: null,
        scheduledStartTime: null,
        scheduledEndTime: null,
      },
      systemInfo: {
        systemName: 'AirLux',
        supportEmail: 'support@airlux.lk',
        supportPhoneNumber: '+94 11 234 5678',
      },
      logging: {
        logRetentionDays: 30,
        enableActivityLogs: true,
        enableErrorLogs: true,
        enableSecurityLogs: true,
        logLevel: 'INFO',
      },
      updatedBy: null,
    });

    console.log('✓ SystemConfig seeded successfully');
    console.log('Default Configuration:', JSON.stringify(config, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding SystemConfig:', error);
    process.exit(1);
  }
}

seedSystemConfig();
