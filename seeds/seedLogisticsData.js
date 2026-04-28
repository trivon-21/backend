const mongoose = require('mongoose');
require('dotenv').config();
const Order = require('../src/models/Order');
const MaterialRequest = require('../src/models/MaterialRequest');

const seedLogisticsData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB - Database: Dassana');

    // Clear existing data (optional, but good for fresh start)
    await Order.deleteMany({});
    await MaterialRequest.deleteMany({});

    // Seed Orders
    const orders = [
      {
        orderId: 'ORD-2025-001',
        customer: 'Saman Perera',
        date: '2025-02-15',
        type: 'Standard Delivery',
        status: 'to-pack',
        items: [
          { name: '2 Ton Split AC Compressor', qty: 1, confirmed: false, sku: 'AC-COMP-001' },
          { name: 'Filter Drier - Standard', qty: 2, confirmed: false, sku: 'FILTER-DRIER-01' }
        ]
      },
      {
        orderId: 'ORD-2025-002',
        customer: 'Lanka Resorts',
        date: '2025-02-14',
        type: 'Bulk Installation',
        status: 'ready',
        courier: 'City Express',
        trackId: 'CE-998123',
        items: [
          { name: 'R410A Refrigerant (1kg)', qty: 5, confirmed: true, sku: 'REF-R410A-1KG' },
          { name: 'Copper Tube 1/4" x 50m', qty: 2, confirmed: true, sku: 'PIPE-CU-025' }
        ]
      },
      {
        orderId: 'ORD-2025-003',
        customer: 'Global Tech Park',
        date: '2025-02-12',
        type: 'Urgent Replacement',
        status: 'in-transit',
        courier: 'PromptX',
        trackId: 'PX-112233',
        lastMovedAt: new Date(Date.now() - 2 * 3600000), // 2 hours ago
        items: [
          { name: 'Digital Thermostat', qty: 3, confirmed: true, sku: 'THERMOSTAT-DIG' }
        ]
      },
      {
        orderId: 'ORD-2025-004',
        customer: 'Dilshan Silva',
        date: '2025-02-10',
        type: 'Service Part',
        status: 'completed',
        courier: 'Hand Delivery',
        trackId: 'NA',
        completedAt: '2025-02-11',
        items: [
          { name: 'Filter Drier - Standard', qty: 1, confirmed: true, sku: 'FILTER-DRIER-01' }
        ]
      }
    ];

    await Order.insertMany(orders);
    console.log('✅ Orders seeded');

    // Seed Material Requests
    const requests = [
      {
        requestId: 'REQ-2025-101',
        requester: 'Sunil Perera (Lead Tech)',
        date: '2025-02-16',
        location: 'Kandy Project Site',
        status: 'pending',
        items: [
          { name: '2 Ton Split AC Compressor', qty: 2, confirmed: false, sku: 'AC-COMP-001' },
          { name: 'R410A Refrigerant (1kg)', qty: 3, confirmed: false, sku: 'REF-R410A-1KG' }
        ]
      },
      {
        requestId: 'REQ-2025-102',
        requester: 'Amal Fernando (Senior Tech)',
        date: '2025-02-15',
        location: 'Colombo 07 - Maintenance',
        status: 'reserved',
        serviceTeam: 'Team Alpha',
        lastMovedAt: new Date(Date.now() - 4 * 3600000),
        items: [
          { name: 'Digital Thermostat', qty: 10, confirmed: true, sku: 'THERMOSTAT-DIG' },
          { name: 'Copper Tube 1/4" x 50m', qty: 1, confirmed: true, sku: 'PIPE-CU-025' }
        ]
      },
      {
        requestId: 'REQ-2025-103',
        requester: 'Ruwan Kumara',
        date: '2025-02-12',
        location: 'Galle Face Hotel',
        status: 'completed',
        serviceTeam: 'Team Gamma',
        completedAt: '2025-02-13',
        items: [
          { name: 'Filter Drier - Standard', qty: 5, confirmed: true, sku: 'FILTER-DRIER-01' }
        ]
      }
    ];

    await MaterialRequest.insertMany(requests);
    console.log('✅ Material Requests seeded');

    mongoose.connection.close();
    console.log('Connection closed');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
};

seedLogisticsData();
