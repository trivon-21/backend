const mongoose = require('mongoose');
const OrderRequest = require('../../models/OrderRequest');

/**
 * Manager Orders / Approvals Service
 *
 * Surfaces procurement purchase requests (the OrderRequest collection) for
 * managerial review, and lets the manager approve or reject them. Falls back to
 * representative mock requests when the DB is empty or offline so the Manager →
 * Orders screen is always usable.
 */

function mockRequests() {
  const now = Date.now();
  return [
    {
      _id: 'mock_or1',
      requestId: 'PR-1022',
      supplierName: 'CoolAir Distributors',
      totalEstimate: 184500,
      status: 'pending-approval',
      priority: 'urgent',
      requestedBy: 'Inventory Manager',
      items: [
        { name: 'Outdoor Unit 2.0T', sku: 'AC-OU-20', quantity: 5, estimatedTotal: 125000 },
        { name: 'Copper Pipe 1/4"', sku: 'CP-14', quantity: 40, estimatedTotal: 59500 },
      ],
      createdAt: new Date(now - 3 * 60 * 60 * 1000),
    },
    {
      _id: 'mock_or2',
      requestId: 'PR-1021',
      supplierName: 'ThermoParts Lanka',
      totalEstimate: 42300,
      status: 'pending-approval',
      priority: 'normal',
      requestedBy: 'Inventory Manager',
      items: [{ name: 'Thermostat Digital', sku: 'TH-DIG', quantity: 15, estimatedTotal: 42300 }],
      createdAt: new Date(now - 26 * 60 * 60 * 1000),
    },
    {
      _id: 'mock_or3',
      requestId: 'PR-1019',
      supplierName: 'CoolAir Distributors',
      totalEstimate: 98000,
      status: 'approved',
      priority: 'normal',
      requestedBy: 'Inventory Manager',
      approvedBy: 'Manager',
      items: [{ name: 'Indoor Unit 1.5T', sku: 'AC-IU-15', quantity: 4, estimatedTotal: 98000 }],
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
    },
    {
      _id: 'mock_or4',
      requestId: 'PR-1016',
      supplierName: 'Generic Spares Co.',
      totalEstimate: 15600,
      status: 'rejected',
      priority: 'normal',
      requestedBy: 'Inventory Manager',
      rejectionReason: 'Non-preferred supplier',
      items: [{ name: 'Remote Controllers', sku: 'RC-STD', quantity: 20, estimatedTotal: 15600 }],
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
    },
  ];
}

function isOffline() {
  return mongoose.connection.readyState !== 1;
}

function summarize(list) {
  const pending = list.filter((o) => o.status === 'pending-approval');
  return {
    pending: pending.length,
    approved: list.filter((o) => o.status === 'approved').length,
    rejected: list.filter((o) => o.status === 'rejected').length,
    pendingValue: pending.reduce((sum, o) => sum + (o.totalEstimate || 0), 0),
  };
}

exports.listOrders = async (filters = {}) => {
  let orders = [];
  let offline = false;

  try {
    if (isOffline()) throw new Error('DB offline');
    orders = await OrderRequest.find({ status: { $ne: 'draft' } })
      .sort({ createdAt: -1 })
      .lean();
    if (!orders.length) {
      orders = mockRequests();
      offline = true;
    }
  } catch (err) {
    orders = mockRequests();
    offline = true;
  }

  const summary = summarize(orders);

  if (filters.status && filters.status !== 'all') {
    orders = orders.filter((o) => o.status === filters.status);
  }

  return { status: offline ? 'Offline' : 'Operational', summary, orders };
};

exports.decideOrder = async (id, decision, reason, approver) => {
  if (!['approved', 'rejected'].includes(decision)) {
    throw new Error('Invalid decision');
  }

  const update = { status: decision };
  if (decision === 'approved') {
    update.approvedBy = approver || 'Manager';
    update.approvedAt = new Date();
  } else {
    update.rejectionReason = reason || '';
    update.rejectedAt = new Date();
  }

  if (isOffline()) {
    return { _id: id, ...update, offline: true };
  }

  const order = await OrderRequest.findByIdAndUpdate(id, update, { new: true }).lean();
  return order;
};
