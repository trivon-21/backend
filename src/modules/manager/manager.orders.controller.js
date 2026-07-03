const service = require('./manager.orders.service');

/**
 * GET /api/manager/orders?status=
 * Lists purchase requests awaiting/after managerial decision, with summary tiles.
 */
exports.list = async (req, res) => {
  try {
    const data = await service.listOrders({ status: req.query.status });
    res.json(data);
  } catch (error) {
    console.error('Manager orders fetch error:', error);
    res.json({
      status: 'Offline',
      summary: { pending: 0, approved: 0, rejected: 0, pendingValue: 0 },
      orders: [],
    });
  }
};

/**
 * PATCH /api/manager/orders/:id  { decision: 'approved'|'rejected', reason? }
 */
exports.decide = async (req, res) => {
  try {
    const { decision, reason } = req.body || {};
    const approver = req.user?.fullName || 'Manager';
    const order = await service.decideOrder(req.params.id, decision, reason, approver);
    if (!order) return res.status(404).json({ message: 'Purchase request not found' });
    res.json(order);
  } catch (error) {
    console.error('Manager order decision error:', error);
    res.status(400).json({ message: error.message || 'Failed to update purchase request' });
  }
};
