/**
 * Seed script to initialize SystemConfig with default values
 * Run: npm run seed:config
 */

require('dotenv').config();
const mongoose = require('mongoose');
const dns = require('dns');
const SystemConfig = require('../src/models/SystemConfig');

async function seedSystemConfig() {
  try {
    // Configure DNS servers to fix querySrv issues for remote clusters
    const dnsServers = (process.env.MONGO_DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',');
    dns.setServers(dnsServers);

    // Connect to the shared team database configured in the environment.
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/airlux';
    const mongoDbName = process.env.MONGO_DB_NAME || 'airlux';
    
    await mongoose.connect(mongoUri, { dbName: mongoDbName });
    console.log('✓ Connected to MongoDB');

    // Clear existing config to ensure clean reset
    await SystemConfig.deleteMany({});
    console.log('✓ Cleared existing SystemConfig');

    // Create default SystemConfig
    const config = await SystemConfig.create({
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
