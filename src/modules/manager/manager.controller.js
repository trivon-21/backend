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
    res.json({
      managerName: req.user?.fullName?.split(' ')[0] || 'Manager',
      currentDate: new Date(),
      status: 'Offline',
      stats: {
        pendingTickets: { total: 0, subStats: [] },
        vehicleAvailability: { total: '0/0', subStats: [] },
        todaysSchedule: { total: 0, subStats: [] },
        escalations: { total: 0, subStats: [] }
      },
      inventoryKpis: {
        reservedItems: { label: 'Reserved Items', value: 0, icon: 'clipboard-check' },
        lowStockAlerts: { label: 'Low Stock Alerts', value: 0, icon: 'triangle-alert' },
        pendingDeliveries: { label: 'Pending Deliveries', value: 0, icon: 'truck' }
      },
      recentActivity: [],
      pendingActions: []
    });
  }
};
