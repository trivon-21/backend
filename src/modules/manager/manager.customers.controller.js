const service = require('./manager.customers.service');

/**
 * GET /api/manager/customers
 * Returns paginated customer profiles with interaction summaries & summary KPIs.
 */
exports.listCustomers = async (req, res) => {
  try {
    const {
      search,
      status,
      sortBy,
      sortOrder,
      page,
      limit,
    } = req.query;

    const data = await service.getCustomers({
      search,
      status,
      sortBy,
      sortOrder,
      page,
      limit,
    });

    res.json(data);
  } catch (error) {
    console.error('Manager list customers error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to retrieve customers',
      summary: {
        totalCustomers: 0,
        activeCustomers: 0,
        customersWithOrders: 0,
        totalCustomerSpend: 0,
      },
      customers: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 15,
        totalPages: 0,
      },
    });
  }
};

/**
 * GET /api/manager/customers/:id
 * Returns deep historical details for a single customer.
 */
exports.getCustomerDetails = async (req, res) => {
  try {
    const data = await service.getCustomerDetails(req.params.id);
    res.json(data);
  } catch (error) {
    console.error('Manager get customer details error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to retrieve customer details',
    });
  }
};
