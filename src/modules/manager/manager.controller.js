const service = require("./manager.service");

/**
 * Handles dashboard data retrieval for the Manager role.
 * Returns a fallback/offline state if the backend service fails.
 */
exports.getDashboard = async (req, res) => {
  try {
    const data = await service.getDashboardData(req.user);
    res.json(data);
  } catch (error) {
    console.error('Manager dashboard fetch error:', error);
    res.status(error.statusCode || 503).json({
      managerName: req.user?.fullName?.split(' ')[0] || 'Manager',
      currentDate: new Date(),
      status: 'Offline',
      stats: {
        openTickets: { total: 0, subStats: [] },
        unassignedTickets: { total: 0, subStats: [] },
        slaRisk: { total: 0, subStats: [] },
        pendingApprovals: { total: 0, subStats: [] }
      },
      inventoryKpis: {
        reservedItems: { label: 'Reserved Items', value: 0, icon: 'clipboard-check' },
        lowStockAlerts: { label: 'Low Stock Alerts', value: 0, icon: 'triangle-alert' },
        pendingMaterialRequests: { label: 'Pending Material Requests', value: 0, icon: 'package' }
      },
      recentActivity: [],
      pendingActions: [],
      message: error.message
    });
  }
};
