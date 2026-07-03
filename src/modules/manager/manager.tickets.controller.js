const service = require('./manager.tickets.service');

/**
 * GET /api/manager/tickets?status=&priority=
 * Returns the ticket list + summary counts, with an offline fallback shape.
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
    res.json({
      status: 'Offline',
      summary: { total: 0, open: 0, inProgress: 0, escalated: 0, resolved: 0 },
      tickets: [],
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
    res.status(500).json({ message: 'Failed to update ticket' });
  }
};
