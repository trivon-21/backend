const service = require('./manager.customers.service');

/**
 * GET /api/manager/customers?search=
 * Read-only customer directory (CUSTOMER-role users), safe fields only.
 */
exports.list = async (req, res) => {
  try {
    const data = await service.listCustomers({ search: req.query.search });
    res.json(data);
  } catch (error) {
    console.error('Manager customers fetch error:', error);
    res.json({ status: 'Offline', total: 0, customers: [] });
  }
};
