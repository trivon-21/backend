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
      {
        sku: 'AC-COMP-001',
        name: '2 Ton Split AC Scroll Compressor',
        type: 'Single',
        category: 'Spare Parts',
        itemClass: 'Spare Parts',
        subcategory: 'Compressor',
        brand: 'Copeland',
        manufacturerPartNumber: 'ZP24K5E',
        compatibleModels: ['Universal 24K split systems'],
        systemType: 'Split',
        refrigerants: ['R410A'],
        capacityBtu: 24000,
        voltage: '230 V',
        phase: 'Single Phase',
        available: 1,
        reserved: 1,
        location: 'Main Warehouse',
        binLocation: 'SP-A01',
        unit: 'units',
        unitCost: 185000,
        reorderLevel: 2,
        maxStockLevel: 6,
        status: 'warning'
      },
      {
        sku: 'REF-R410A-11KG',
        name: 'R410A Refrigerant Cylinder (11.3kg)',
        type: 'Single',
        category: 'Consumables',
        itemClass: 'Consumables',
        subcategory: 'Refrigerant',
        brand: 'Generic',
        systemType: 'Universal',
        refrigerants: ['R410A'],
        phase: 'Not Applicable',
        available: 4,
        reserved: 1,
        location: 'Main Warehouse',
        binLocation: 'HAZ-R02',
        unit: 'cylinders',
        unitCost: 65000,
        reorderLevel: 4,
        maxStockLevel: 12,
        status: 'warning'
      },
      {
        sku: 'PIPE-CU-025',
        name: 'Copper Tube 1/4" x 50m',
        type: 'Single',
        category: 'Installation Materials',
        itemClass: 'Installation Materials',
        subcategory: 'Copper Tube / Line Set',
        brand: 'Generic',
        systemType: 'Universal',
        phase: 'Not Applicable',
        available: 10,
        reserved: 0,
        location: 'Main Warehouse',
        binLocation: 'MAT-C03',
        unit: 'rolls',
        unitCost: 48000,
        reorderLevel: 5,
        maxStockLevel: 20,
        status: 'normal'
      },
      {
        sku: 'KIT-INST-PRO',
        name: 'Standard Split AC Installation Kit',
        type: 'Kit',
        category: 'Kits and Bundles',
        itemClass: 'Kits and Bundles',
        subcategory: 'Installation Kit',
        brand: 'AirLux',
        systemType: 'Split',
        phase: 'Not Applicable',
        available: 2,
        reserved: 0,
        location: 'Kitting Area',
        binLocation: 'KIT-B01',
        unit: 'kits',
        unitCost: 22500,
        reorderLevel: 2,
        maxStockLevel: 10,
        status: 'warning'
      },
      {
        sku: 'TOOL-VAC-001',
        name: 'HVAC Vacuum Pump',
        type: 'Single',
        category: 'Tools and Test Equipment',
        itemClass: 'Tools and Test Equipment',
        subcategory: 'Vacuum Pump',
        brand: 'Fieldpiece',
        manufacturerPartNumber: 'VP67',
        systemType: 'Universal',
        refrigerants: ['R32', 'R410A'],
        voltage: '230 V',
        phase: 'Single Phase',
        available: 2,
        reserved: 1,
        location: 'Tool Store',
        binLocation: 'TOOL-A02',
        unit: 'units',
        unitCost: 210000,
        reorderLevel: 1,
        maxStockLevel: 4,
        isSerialized: true,
        serialNumbers: ['VP67-ALX-001', 'VP67-ALX-002'],
        status: 'normal'
      },
      {
        sku: 'FILTER-DRIER-01',
        name: 'Bi-Flow Filter-Drier',
        type: 'Single',
        category: 'Spare Parts',
        itemClass: 'Spare Parts',
        subcategory: 'Filter-Drier / Sight Glass',
        brand: 'Parker Sporlan',
        manufacturerPartNumber: 'HPC-163-S-HH',
        systemType: 'Universal',
        refrigerants: ['R32', 'R410A'],
        phase: 'Not Applicable',
        available: 7,
        reserved: 4,
        location: 'Main Warehouse',
        binLocation: 'SP-D04',
        unit: 'units',
        unitCost: 8500,
        reorderLevel: 5,
        maxStockLevel: 20,
        status: 'normal'
      },
      {
        sku: 'THERMOSTAT-DIG',
        name: 'Universal Digital Thermostat',
        type: 'Single',
        category: 'Spare Parts',
        itemClass: 'Spare Parts',
        subcategory: 'Sensor / Thermostat / Remote',
        brand: 'Generic',
        compatibleModels: ['Universal'],
        systemType: 'Universal',
        phase: 'Not Applicable',
        available: 8,
        reserved: 6,
        location: 'Main Warehouse',
        binLocation: 'SP-E06',
        unit: 'units',
        unitCost: 9500,
        reorderLevel: 5,
        maxStockLevel: 20,
        status: 'normal'
      },
      {
        sku: 'KIT-MAINT-STD',
        name: 'Standard AC Maintenance Kit',
        type: 'Bundle',
        category: 'Kits and Bundles',
        itemClass: 'Kits and Bundles',
        subcategory: 'Maintenance Kit',
        brand: 'AirLux',
        systemType: 'Universal',
        phase: 'Not Applicable',
        available: 5,
        reserved: 1,
        location: 'Kitting Area',
        binLocation: 'KIT-B03',
        unit: 'kits',
        unitCost: 14500,
        reorderLevel: 5,
        maxStockLevel: 15,
        status: 'warning'
      }
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
