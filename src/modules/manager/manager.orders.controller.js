const service = require('./manager.orders.service');

/**
 * GET /api/manager/orders?status=
 * Lists purchase requests awaiting/after managerial decision, with summary tiles.
 */
exports.list = async (req, res) => {
  try {
    const data = await service.listOrders({ status: req.query.status }, req.user);
    res.json(data);
  } catch (error) {
    console.error('Manager orders fetch error:', error);
    res.status(error.statusCode || 503).json({
      status: 'Offline',
      summary: { pending: 0, approved: 0, rejected: 0, pendingValue: 0 },
      orders: [],
      message: error.message,
    });
  }
};

/**
 * PATCH /api/manager/orders/:id  { decision: 'approved'|'rejected', reason? }
 */
exports.decide = async (req, res) => {
  try {
    const order = await service.decideOrder(req.params.id, req.body || {}, req.user);
    res.json(order);
  } catch (error) {
    console.error('Manager order decision error:', error);
    res.status(error.statusCode || 400).json({
      message: error.message || 'Failed to update purchase request',
      code: error.code,
    });
  }
};

exports.listReceiptAuthorizations = async (req, res) => {
  try {
    res.json(await service.listReceiptAuthorizations(req.query, req.user));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message, code: error.code });
  }
};

exports.decideReceiptAuthorization = async (req, res) => {
  try {
    res.json(await service.decideReceiptAuthorization(req.params.id, req.body || {}, req.user));
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message, code: error.code });
  }
};
