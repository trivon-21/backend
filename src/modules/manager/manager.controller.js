const service = require("./manager.service");

exports.getStatus = (_req, res) => {
  res.json({ status: 'Operational' });
};

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
        pendingMaterialRequests: { label: 'Pending Material Requests', value: 0, icon: 'package' },
        blockedMaterialRequests: { label: 'Blocked Material Requests', value: 0, icon: 'triangle-alert' }
      },
      recentActivity: [],
      pendingActions: [],
      message: error.message
    });
  }
};
/**
 * POST /api/manager/payments/auto-cancel
 * Manually trigger payment auto-cancel job
 */
exports.triggerPaymentAutoCancel = async (req, res) => {
  try {
    const result = await service.triggerPaymentAutoCancelJob();
    res.status(200).json({
      success: true,
      message: "Payment auto-cancel job triggered",
      data: result,
    });
  } catch (error) {
    console.error("Error triggering payment auto-cancel:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to trigger payment auto-cancel",
    });
  }
};
