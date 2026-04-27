/**
 * Seed script to initialize SystemConfig with default values
 * Run: npm run seed:config
 */

require('dotenv').config();
const mongoose = require('mongoose');
const SystemConfig = require('../src/models/SystemConfig');

async function seedSystemConfig() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Dashintha_Test');
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
