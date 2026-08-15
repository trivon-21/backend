const service = require('./manager.tickets.service');

/**
 * GET /api/manager/tickets?status=&priority=
 * Returns the ticket list and summary counts.
 */
exports.list = async (req, res) => {
  try {
    const data = await service.listTickets({
      status: req.query.status,
      priority: req.query.priority,
    });
    res.json(data);
  } catch (error) {
    console.error('Manager tickets fetch error:', error);
    res.status(error.statusCode || 503).json({
      status: 'Offline',
      summary: { total: 0, open: 0, inProgress: 0, escalated: 0, resolved: 0 },
      tickets: [],
      message: error.message,
    });
  }
};

/**
 * PATCH /api/manager/tickets/:id
 * Updates status / priority / assignedTo (assign, escalate, resolve).
 */
exports.update = async (req, res) => {
  try {
    const ticket = await service.updateTicket(req.params.id, req.body || {});
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json(ticket);
  } catch (error) {
    console.error('Manager ticket update error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to update ticket',
      code: error.code,
    });
  }
};

exports.listTechnicians = async (req, res) => {
  try {
    res.json({ technicians: await service.listTechnicians() });
  } catch (error) {
    console.error('Manager technicians fetch error:', error);
    res.status(error.statusCode || 503).json({ technicians: [], message: error.message });
  }
};
