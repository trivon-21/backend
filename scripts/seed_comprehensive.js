const mongoose = require('mongoose');
require('dotenv').config();

const Inventory = require('../src/models/Inventory');
const Order = require('../src/models/Order');
const MaterialRequest = require('../src/models/MaterialRequest');
const AssetLoan = require('../src/models/AssetLoan');
const Activity = require('../src/models/Activity');
const Logistics = require('../src/models/Logistics');

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) throw new Error('MONGO_URI not found in .env');

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for seeding...');

    // Clear existing data (Optional, but good for a clean state)
    // await Inventory.deleteMany({});
    // await Order.deleteMany({});
    // await MaterialRequest.deleteMany({});
    // await AssetLoan.deleteMany({});
    // await Activity.deleteMany({});

    console.log('Seeding Inventory...');
    const inventoryItems = [
      {
        name: 'Trina Solar 550W Panel',
        sku: 'PV-TR-550',
        type: 'Single',
        category: 'Solar Panels',
        brand: 'Trina Solar',
        available: 120,
        reserved: 45,
        location: 'Zone A-1',
        unit: 'units',
        reorderLevel: 50,
        maxStockLevel: 500,
        unitCost: 18500,
        status: 'normal'
      },
      {
        name: 'Huawei Sun2000 5KTL',
        sku: 'INV-HW-5K',
        type: 'Single',
        category: 'Inverters',
        brand: 'Huawei',
        available: 8,
        reserved: 12,
        location: 'Zone B-2',
        unit: 'units',
        reorderLevel: 10,
        maxStockLevel: 50,
        unitCost: 145000,
        status: 'critical'
      },
      {
        name: 'Jinko Tiger Neo 470W',
        sku: 'PV-JK-470',
        type: 'Single',
        category: 'Solar Panels',
        brand: 'Jinko Solar',
        available: 45,
        reserved: 20,
        location: 'Zone A-2',
        unit: 'units',
        reorderLevel: 100,
        maxStockLevel: 1000,
        unitCost: 16200,
        status: 'warning'
      },
      {
        name: 'Victron MultiPlus II 3000',
        sku: 'INV-VC-3K',
        type: 'Single',
        category: 'Inverters',
        brand: 'Victron',
        available: 15,
        reserved: 0,
        location: 'Zone B-1',
        unit: 'units',
        reorderLevel: 5,
        maxStockLevel: 20,
        unitCost: 210000,
        status: 'normal'
      },
      {
        name: 'Pylontech US3000C',
        sku: 'BAT-PY-3.5',
        type: 'Single',
        category: 'Batteries',
        brand: 'Pylontech',
        available: 24,
        reserved: 30,
        location: 'Zone C-1',
        unit: 'units',
        reorderLevel: 40,
        maxStockLevel: 200,
        unitCost: 195000,
        status: 'warning'
      },
      {
        name: 'MC4 Connector Male/Female',
        sku: 'ACC-MC4-SET',
        type: 'Single',
        category: 'Accessories',
        brand: 'Staubli',
        available: 850,
        reserved: 200,
        location: 'Bin 42',
        unit: 'sets',
        reorderLevel: 500,
        maxStockLevel: 5000,
        unitCost: 150,
        status: 'normal'
      },
      {
        name: 'Solar Cable 6mm DC (Red)',
        sku: 'CAB-DC-6R',
        type: 'Single',
        category: 'Cables',
        brand: 'Nexans',
        available: 1200,
        reserved: 400,
        location: 'Zone D-1',
        unit: 'meters',
        reorderLevel: 2000,
        maxStockLevel: 10000,
        unitCost: 85,
        status: 'warning'
      },
      {
        name: 'Milwaukee M18 Fuel Drill',
        sku: 'TL-MW-M18D',
        type: 'Single',
        category: 'Tools',
        brand: 'Milwaukee',
        available: 12,
        reserved: 0,
        location: 'Tool Room',
        unit: 'units',
        reorderLevel: 2,
        maxStockLevel: 15,
        unitCost: 45000,
        status: 'normal',
        isSerialized: true,
        serialNumbers: ['MW18-001', 'MW18-002', 'MW18-003']
      },
      {
        name: 'Fluke 117 Multimeter',
        sku: 'TL-FL-117',
        type: 'Single',
        category: 'Tools',
        brand: 'Fluke',
        available: 5,
        reserved: 0,
        location: 'Tool Room',
        unit: 'units',
        reorderLevel: 2,
        maxStockLevel: 10,
        unitCost: 65000,
        status: 'normal',
        isSerialized: true,
        serialNumbers: ['FLK-881', 'FLK-882']
      },
      {
        name: 'Mounting Rail 4.2m',
        sku: 'STR-RL-4.2',
        type: 'Single',
        category: 'Structure',
        brand: 'AluPro',
        available: 0,
        reserved: 15,
        location: 'Yard 1',
        unit: 'units',
        reorderLevel: 50,
        maxStockLevel: 500,
        unitCost: 4500,
        status: 'critical'
      }
    ];

    for (const item of inventoryItems) {
      await Inventory.findOneAndUpdate({ sku: item.sku }, item, { upsert: true, new: true });
    }

    console.log('Seeding Orders...');
    const orders = [
      {
        orderId: 'ORD-20250429-001',
        customer: 'Green Energy Solutions',
        date: '2025-04-29',
        type: 'Project Supply',
        status: 'to-pack',
        items: [
          { name: 'Trina Solar 550W Panel', qty: 20, sku: 'PV-TR-550', confirmed: true },
          { name: 'Huawei Sun2000 5KTL', qty: 1, sku: 'INV-HW-5K', confirmed: false }
        ]
      },
      {
        orderId: 'ORD-20250429-002',
        customer: 'SunPower Residential',
        date: '2025-04-29',
        type: 'Retail',
        status: 'ready',
        courier: 'Prompt Express',
        trackId: 'PRX998877',
        items: [
          { name: 'Jinko Tiger Neo 470W', qty: 10, sku: 'PV-JK-470', confirmed: true },
          { name: 'MC4 Connector Male/Female', qty: 20, sku: 'ACC-MC4-SET', confirmed: true }
        ]
      },
      {
        orderId: 'ORD-20250428-015',
        customer: 'Trivon PV Ltd',
        date: '2025-04-28',
        type: 'Project Supply',
        status: 'in-transit',
        courier: 'DMX Logistics',
        trackId: 'DMX-445566',
        items: [
          { name: 'Pylontech US3000C', qty: 4, sku: 'BAT-PY-3.5', confirmed: true }
        ]
      }
    ];

    for (const order of orders) {
      await Order.findOneAndUpdate({ orderId: order.orderId }, order, { upsert: true, new: true });
    }

    console.log('Seeding Material Requests...');
    const requests = [
      {
        requestId: 'REQ-0429-001',
        requester: 'Saman Kumara',
        date: '2025-04-29',
        location: 'Kandy Project Site',
        status: 'pending',
        serviceTeam: 'Team Alpha',
        items: [
          { name: 'Solar Cable 6mm DC (Red)', qty: 100, sku: 'CAB-DC-6R', confirmed: false },
          { name: 'MC4 Connector Male/Female', qty: 10, sku: 'ACC-MC4-SET', confirmed: false }
        ]
      },
      {
        requestId: 'REQ-0429-002',
        requester: 'Nuwan Perera',
        date: '2025-04-29',
        location: 'Colombo 07 Site',
        status: 'reserved',
        serviceTeam: 'Team Gamma',
        items: [
          { name: 'Victron MultiPlus II 3000', qty: 1, sku: 'INV-VC-3K', confirmed: true }
        ]
      }
    ];

    for (const req of requests) {
      await MaterialRequest.findOneAndUpdate({ requestId: req.requestId }, req, { upsert: true, new: true });
    }

    console.log('Seeding Asset Loans...');
    const inventoryTools = await Inventory.find({ category: 'Tools' });
    if (inventoryTools.length > 0) {
      const tool = inventoryTools[0];
      const loan = {
        toolId: tool._id,
        toolName: tool.name,
        assetTag: tool.serialNumbers[0] || 'TL-001',
        technicianId: 'TECH-001',
        technicianName: 'Chaminda Silva',
        checkedOutAt: new Date(Date.now() - 86400000 * 2), // 2 days ago
        dueDate: new Date(Date.now() + 86400000) // Tomorrow
      };
      await AssetLoan.findOneAndUpdate({ assetTag: loan.assetTag }, loan, { upsert: true, new: true });
      
      const overdueLoan = {
        toolId: tool._id,
        toolName: tool.name,
        assetTag: tool.serialNumbers[1] || 'TL-002',
        technicianId: 'TECH-005',
        technicianName: 'Kasun Rajitha',
        checkedOutAt: new Date(Date.now() - 86400000 * 10), // 10 days ago
        dueDate: new Date(Date.now() - 86400000 * 3) // 3 days ago (Overdue)
      };
      await AssetLoan.findOneAndUpdate({ assetTag: overdueLoan.assetTag }, overdueLoan, { upsert: true, new: true });
    }

    console.log('Database Seeding Completed Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
};

seedData();
