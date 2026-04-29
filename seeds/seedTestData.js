const mongoose = require('mongoose');
const path = require('path');
const dns = require('dns');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MaterialRequest = require('../src/models/MaterialRequest');
const OrderRequest = require('../src/models/OrderRequest');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/airlux';

const seedTestData = async () => {
  try {
    // Configure DNS servers to fix querySrv issues
    const dnsServers = (process.env.MONGO_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",");
    dns.setServers(dnsServers);

    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');

    // Clear existing data for these specific models
    await MaterialRequest.deleteMany({});
    await OrderRequest.deleteMany({});
    console.log('✓ Cleared existing Material Requests and Order Requests');

    // Seed Material Requests
    const materialRequests = [
      {
        requestId: 'REQ-MAT-001',
        requester: 'Sunil Perera (Lead Tech)',
        date: '2026-04-28',
        location: 'Colombo 03 - Site A',
        status: 'pending',
        items: [
          { name: '2 Ton Split AC Compressor', qty: 2, sku: 'AC-COMP-001', confirmed: false },
          { name: 'R410A Refrigerant (1kg)', qty: 3, sku: 'REF-R410A-1KG', confirmed: false }
        ]
      },
      {
        requestId: 'REQ-MAT-002',
        requester: 'Amal Fernando',
        date: '2026-04-29',
        location: 'Kandy Project Office',
        status: 'reserved',
        serviceTeam: 'Alpha Squad',
        items: [
          { name: 'Digital Thermostat', qty: 5, sku: 'THERMOSTAT-DIG', confirmed: true },
          { name: 'Copper Tube 1/4" x 50m', qty: 1, sku: 'PIPE-CU-025', confirmed: true }
        ],
        lastMovedAt: new Date()
      },
      {
        requestId: 'REQ-MAT-003',
        requester: 'Dilshan Silva',
        date: '2026-04-25',
        location: 'Galle Service Center',
        status: 'completed',
        serviceTeam: 'Team Gamma',
        completedAt: '2026-04-26',
        items: [
          { name: 'Filter Drier - Standard', qty: 10, sku: 'FILTER-DRIER-01', confirmed: true }
        ]
      }
    ];

    await MaterialRequest.insertMany(materialRequests);
    console.log('✅ Material Requests seeded');

    // Seed Order Requests (Pending Requests)
    const orderRequests = [
      {
        requestId: 'ORD-REQ-1001',
        supplierName: 'Arctic Cooling Solutions',
        requestedBy: 'Inventory Manager',
        status: 'pending-approval',
        priority: 'urgent',
        totalEstimate: 150000,
        notes: 'Urgent replacement stock for upcoming summer season.',
        items: [
          { name: '2 Ton Split AC Compressor', sku: 'AC-COMP-001', quantity: 5, unitCost: 25000, estimatedTotal: 125000 },
          { name: 'R410A Refrigerant (1kg)', sku: 'REF-R410A-1KG', quantity: 10, unitCost: 2500, estimatedTotal: 25000 }
        ],
        source: 'manual'
      },
      {
        requestId: 'ORD-REQ-1002',
        supplierName: 'Global Parts Hub',
        requestedBy: 'Senior Procurement Officer',
        status: 'approved',
        priority: 'normal',
        totalEstimate: 45000,
        approvedBy: 'Admin User',
        approvedAt: new Date(),
        items: [
          { name: 'Digital Thermostat', sku: 'THERMOSTAT-DIG', quantity: 15, unitCost: 3000, estimatedTotal: 45000 }
        ],
        source: 'low-stock'
      },
      {
        requestId: 'ORD-REQ-1003',
        supplierName: 'Industrial Spares Ltd',
        requestedBy: 'Lead Technician',
        status: 'rejected',
        priority: 'normal',
        totalEstimate: 12000,
        rejectionReason: 'Exceeds monthly budget for unscheduled maintenance.',
        rejectedAt: new Date(),
        items: [
          { name: 'Copper Tube 1/4" x 50m', sku: 'PIPE-CU-025', quantity: 2, unitCost: 6000, estimatedTotal: 12000 }
        ],
        source: 'manual'
      }
    ];

    await OrderRequest.insertMany(orderRequests);
    console.log('✅ Order Requests seeded');

    mongoose.connection.close();
    console.log('✓ Connection closed');
  } catch (err) {
    console.error('✗ Seeding failed:', err.message);
    process.exit(1);
  }
};

seedTestData();
