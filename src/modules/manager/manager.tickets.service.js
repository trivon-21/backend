const mongoose = require('mongoose');
const Ticket = require('../../models/Ticket');

/**
 * Manager Tickets Service
 *
 * Reads service tickets from the database and, when the collection is empty or
 * the DB is offline, falls back to a representative seeded set so the Manager →
 * Tickets screen is always usable (same defensive strategy as manager.service.js).
 */

const HOUR = 60 * 60 * 1000;

function mockTickets() {
  const now = Date.now();
  return [
    {
      _id: 'mock_t1',
      ticketId: 'T-2041',
      subject: 'Compressor failure after install',
      description: 'Customer reports the outdoor unit shuts off intermittently.',
      customer: 'Jane Smith',
      category: 'repair',
      priority: 'high',
      status: 'escalated',
      assignedTo: 'A. Fernando',
      slaDueAt: new Date(now + 3 * HOUR),
      createdAt: new Date(now - 45 * 60 * 1000),
    },
    {
      _id: 'mock_t2',
      ticketId: 'T-2042',
      subject: 'Annual maintenance visit',
      description: 'Scheduled preventive maintenance for 2 split units.',
      customer: 'Ravi Kumar',
      category: 'maintenance',
      priority: 'low',
      status: 'in-progress',
      assignedTo: 'M. Perera',
      slaDueAt: new Date(now + 20 * HOUR),
      createdAt: new Date(now - 5 * HOUR),
    },
    {
      _id: 'mock_t3',
      ticketId: 'T-2043',
      subject: 'New AC installation request',
      description: '3-ton unit installation for a new office space.',
      customer: 'Acme Holdings',
      category: 'installation',
      priority: 'medium',
      status: 'open',
      assignedTo: '',
      slaDueAt: new Date(now + 48 * HOUR),
      createdAt: new Date(now - 8 * HOUR),
    },
    {
      _id: 'mock_t4',
      ticketId: 'T-2044',
      subject: 'Thermostat not responding',
      description: 'Wall thermostat display is blank after a power cut.',
      customer: 'Nimal Perera',
      category: 'repair',
      priority: 'medium',
      status: 'open',
      assignedTo: '',
      slaDueAt: new Date(now + 12 * HOUR),
      createdAt: new Date(now - 2 * HOUR),
    },
    {
      _id: 'mock_t5',
      ticketId: 'T-2039',
      subject: 'Post-service inspection',
      description: 'Quality inspection after ducting replacement.',
      customer: 'Green Valley Hotel',
      category: 'inspection',
      priority: 'low',
      status: 'resolved',
      assignedTo: 'S. Jayasuriya',
      slaDueAt: new Date(now - 6 * HOUR),
      createdAt: new Date(now - 30 * HOUR),
    },
  ];
}

function isOffline() {
  return mongoose.connection.readyState !== 1;
}

exports.listTickets = async (filters = {}) => {
  let tickets = [];
  let offline = false;

  try {
    if (isOffline()) throw new Error('DB offline');
    tickets = await Ticket.find().sort({ createdAt: -1 }).lean();
    if (!tickets.length) {
      tickets = mockTickets();
      offline = true; // real DB, but empty — surface the seeded set
    }
  } catch (err) {
    tickets = mockTickets();
    offline = true;
  }

  // Optional in-memory filtering (keeps the mock path working too).
  if (filters.status && filters.status !== 'all') {
    tickets = tickets.filter((t) => t.status === filters.status);
  }
  if (filters.priority && filters.priority !== 'all') {
    tickets = tickets.filter((t) => t.priority === filters.priority);
  }

  const all = tickets;
  const summary = {
    total: all.length,
    open: all.filter((t) => t.status === 'open').length,
    inProgress: all.filter((t) => t.status === 'in-progress').length,
    escalated: all.filter((t) => t.status === 'escalated').length,
    resolved: all.filter((t) => t.status === 'resolved').length,
  };

  return { status: offline ? 'Offline' : 'Operational', summary, tickets };
};

exports.updateTicket = async (id, patch) => {
  const allowed = ['status', 'priority', 'assignedTo'];
  const update = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) update[key] = patch[key];
  }

  if (isOffline()) {
    // Optimistic echo so the UI can proceed while offline.
    return { _id: id, ...update, offline: true };
  }

  const ticket = await Ticket.findByIdAndUpdate(id, update, { new: true }).lean();
  return ticket;
};
