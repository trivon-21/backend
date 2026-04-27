const mongoose = require('mongoose');
require('dotenv').config();
const Inventory = require('../src/models/Inventory');
const Activity = require('../src/models/Activity');
const Logistics = require('../src/models/Logistics');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Inventory.deleteMany({});
    await Activity.deleteMany({});
    await Logistics.deleteMany({});

    // Seed Inventory
    const inventoryItems = [
      { sku: 'AC-COMP-001', name: '2 Ton Split AC Compressor', type: 'Single', category: 'Repair Parts', available: 1, reserved: 13, location: 'Logistic Area 1', reorderLevel: 25, status: 'critical' },
      { sku: 'REF-R410A-1KG', name: 'R410A Refrigerant (1kg)', type: 'Single', category: 'Installation Kits', available: 4, reserved: 6, location: 'Logistic Area 1', reorderLevel: 10, status: 'warning' },
      { sku: 'PIPE-CU-025', name: 'Copper Tube 1/4" x 50m', type: 'Single', category: 'Installation Kits', available: 10, reserved: 0, location: 'Logistic Area 2', reorderLevel: 5, status: 'normal' },
      { sku: 'KIT-INST-PRO', name: 'Professional Installation Kit', type: 'Bundle', category: 'Installation Kits', available: 2, reserved: 0, location: 'Logistic Area 2', reorderLevel: 2, status: 'normal' },
      { sku: 'TOOL-DRILL-001', name: 'Cordless Drill Kit', type: 'Single', category: 'Repair Parts', available: 2, reserved: 1, location: 'Logistic Area 3', reorderLevel: 3, status: 'warning' },
      { sku: 'FILTER-DRIER-01', name: 'Filter Drier - Standard', type: 'Single', category: 'Repair Parts', available: 7, reserved: 4, location: 'Logistic Area 1', reorderLevel: 5, status: 'normal' },
      { sku: 'THERMOSTAT-DIG', name: 'Digital Thermostat', type: 'Single', category: 'Repair Parts', available: 8, reserved: 6, location: 'Logistic Area 2', reorderLevel: 5, status: 'normal' },
      { sku: 'KIT-MAINT-STD', name: 'Standard Maintenance Bundle', type: 'Bundle', category: 'Installation Kits', available: 5, reserved: 1, location: 'Logistic Area 3', reorderLevel: 5, status: 'normal' }
    ];

    await Inventory.insertMany(inventoryItems);
    console.log('Inventory seeded');

    // Seed Activities
    const activities = [
      {
        type: 'return',
        title: 'Lead Tech Sunil returned 5 items from Job #202',
        description: '3 restocked, 2 scrap.',
        timestamp: new Date(Date.now() - 10 * 60000),
        actionLabel: 'View Details'
      },
      {
        type: 'dispatch',
        title: 'Finance verified payment for Order #552',
        description: 'Ready for dispatch.',
        timestamp: new Date(Date.now() - 45 * 60000),
        actionLabel: 'Proceed'
      },
      {
        type: 'request',
        title: 'Main Tech uploaded a material list for Job #2134',
        description: 'Waiting for approval.',
        timestamp: new Date(Date.now() - 120 * 60000),
        actionLabel: 'Check'
      },
      {
        type: 'alert',
        title: 'Replacement compressor requested for Ticket #990',
        description: 'Warranty Item.',
        timestamp: new Date(Date.now() - 180 * 60000),
        actionLabel: 'Process'
      }
    ];

    await Activity.insertMany(activities);
    console.log('Activities seeded');

    // Seed Logistics
    const logistics = [
      { label: 'Scheduled Deliveries', current: 12, total: 15, subLabel: '3 pending pickup' },
      { label: 'Confirmed Tracking', current: 8, total: 15, subLabel: '7 missing tracking IDs' }
    ];

    await Logistics.insertMany(logistics);
    console.log('Logistics seeded');

    mongoose.connection.close();
    console.log('Connection closed');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
};

seedData();
