const mongoose = require('mongoose');
const Order = require('../src/models/Order');
const MaterialRequest = require('../src/models/MaterialRequest');
require('dotenv').config({ path: '.env' }); // Make sure to load env

const seedData = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    await Order.deleteMany({});
    await MaterialRequest.deleteMany({});
    console.log('Cleared existing data.');

    const orders = [
      {
        orderId: '#ORD-2025-102',
        customer: 'Kamal Silva',
        date: '2025-02-18',
        type: 'Delivery Only',
        status: 'to-pack',
        items: [
          { name: 'Panasonic 18k Inverter AC', qty: 1, confirmed: false, sku: 'PAN-INV-18K' },
          { name: 'Copper Pipe 1/4"', qty: 3, confirmed: false, sku: 'COP-14-1M' }
        ]
      },
      {
        orderId: '#ORD-2025-101',
        customer: 'Nimal Fernando',
        date: '2025-02-18',
        type: 'With Installation',
        status: 'ready',
        courier: 'Pending',
        trackId: 'Pending',
        items: [
          { name: 'Daikin 12k Non-Inverter', qty: 1, confirmed: true, sku: 'DK-NON-12K' },
          { name: 'Installation Kit Std', qty: 1, confirmed: true, sku: 'INST-KIT-STD' }
        ]
      },
      {
        orderId: '#ORD-2025-100',
        customer: 'Sunil Perera',
        date: '2025-02-17',
        type: 'Delivery Only',
        status: 'in-transit',
        courier: 'Certis Lanka',
        trackId: 'TRK-99381204',
        items: [
          { name: 'LG Compressor 2HP', qty: 2, confirmed: true, sku: 'LG-COMP-2HP' }
        ],
        lastMovedAt: new Date(Date.now() - 30 * 60000) // 30 minutes ago
      },
      {
        orderId: '#ORD-2025-099',
        customer: 'Ruwan Kumara',
        date: '2025-02-16',
        type: 'With Installation',
        status: 'completed',
        courier: 'PromptX',
        trackId: 'PRX-4491023',
        items: [
          { name: 'Capacitor 45uF', qty: 5, confirmed: true, sku: 'CAP-45UF' }
        ],
        completedAt: '2025-02-16',
        lastMovedAt: new Date(Date.now() - 30 * 60000) // 30 minutes ago
      }
    ];

    const materialRequests = [
      {
        requestId: '#REQ-2025-402',
        requester: 'Saman Perera',
        date: '2025-02-18',
        location: 'Colombo 03',
        status: 'pending',
        items: [
          { name: 'LG Inverter 12k - Outdoor Unit', qty: 1, confirmed: false, sku: 'LG-OUT-12K' },
          { name: 'LG Inverter 12k - Indoor Unit', qty: 1, confirmed: false, sku: 'LG-IN-12K' },
          { name: 'Copper Pipe 1/4"', qty: 3, confirmed: false, sku: 'COP-14-1M' }
        ]
      },
      {
        requestId: '#REQ-2025-403',
        requester: 'Kamal Silva',
        date: '2025-02-18',
        location: 'Kandy',
        status: 'pending',
        items: [
          { name: 'Daikin 18k Split Unit', qty: 1, confirmed: false, sku: 'DK-SPL-18K' },
          { name: 'Thermostat Digital', qty: 2, confirmed: false, sku: 'TH-DIG-01' }
        ]
      },
      {
        requestId: '#REQ-2025-400',
        requester: 'Nimal Fernando',
        date: '2025-02-17',
        location: 'Galle',
        status: 'reserved',
        items: [
          { name: 'Compressor 2HP', qty: 1, confirmed: true, sku: 'COMP-2HP' }
        ]
      },
      {
        requestId: '#REQ-2025-399',
        requester: 'Ruwan Kumara',
        date: '2025-02-16',
        location: 'Negombo',
        status: 'completed',
        completedAt: '2025-02-16',
        items: [
          { name: 'Capacitor 45uF', qty: 5, confirmed: true, sku: 'CAP-45UF' }
        ]
      }
    ];

    await Order.insertMany(orders);
    await MaterialRequest.insertMany(materialRequests);
    
    console.log('Seeded database with Orders and Material Requests.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedData();
