const mongoose = require('mongoose');
const User = require('../../models/User');

/**
 * Manager Customers Service
 *
 * Read-only customer directory for the Manager area, sourced from users with the
 * CUSTOMER role. A strict field projection is used so sensitive auth fields
 * (passwordHash, OTPs, reset tokens) never leave the database. Falls back to mock
 * customers when the DB is empty or offline.
 */

// Whitelist of safe, non-sensitive fields to expose.
const SAFE_PROJECTION = 'fullName lastName email phoneNumber address gender createdAt';

function mockCustomers() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return [
    { _id: 'mock_c1', fullName: 'Jane Smith', email: 'jane.smith@example.com', phoneNumber: '+94 77 123 4567', address: 'Colombo 05', createdAt: new Date(now - 120 * day) },
    { _id: 'mock_c2', fullName: 'Ravi Kumar', email: 'ravi.k@example.com', phoneNumber: '+94 71 987 6543', address: 'Kandy', createdAt: new Date(now - 80 * day) },
    { _id: 'mock_c3', fullName: 'Nimal Perera', email: 'nimal.p@example.com', phoneNumber: '+94 76 555 1212', address: 'Galle', createdAt: new Date(now - 45 * day) },
    { _id: 'mock_c4', fullName: 'Acme Holdings', email: 'facilities@acme.lk', phoneNumber: '+94 11 234 5678', address: 'Colombo 03', createdAt: new Date(now - 30 * day) },
    { _id: 'mock_c5', fullName: 'Green Valley Hotel', email: 'maintenance@greenvalley.lk', phoneNumber: '+94 81 222 3333', address: 'Nuwara Eliya', createdAt: new Date(now - 12 * day) },
  ];
}

function isOffline() {
  return mongoose.connection.readyState !== 1;
}

exports.listCustomers = async (filters = {}) => {
  let customers = [];
  let offline = false;

  try {
    if (isOffline()) throw new Error('DB offline');
    customers = await User.find({ role: 'CUSTOMER' }, SAFE_PROJECTION)
      .sort({ createdAt: -1 })
      .lean();
    if (!customers.length) {
      customers = mockCustomers();
      offline = true;
    }
  } catch (err) {
    customers = mockCustomers();
    offline = true;
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    customers = customers.filter(
      (c) =>
        (c.fullName || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phoneNumber || '').toLowerCase().includes(q),
    );
  }

  return { status: offline ? 'Offline' : 'Operational', total: customers.length, customers };
};
