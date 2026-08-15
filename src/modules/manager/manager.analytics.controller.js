const analyticsService = require('./manager.analytics.service');

function emptyAnalytics(period) {
  return {
    period,
    status: 'Offline',
    generatedAt: new Date(),
    kpis: {
      ticketsCreated: 0,
      ticketsResolved: 0,
      avgResolutionHours: 0,
      pendingApprovalValue: 0,
    },
    ticketTrend: { labels: [], created: [], resolved: [] },
    ticketStatus: [],
    serviceTypes: [],
    technicianWorkload: [],
    approvalSummary: [],
    inventorySignals: { lowStockAlerts: 0, reservedItems: 0, pendingRequests: 0 },
  };
}

exports.getAnalytics = async (req, res) => {
  const period = ['7d', '30d', '12m'].includes(req.query.period) ? req.query.period : '7d';
  try {
    res.json(await analyticsService.getAnalyticsData(req.user, period));
  } catch (error) {
    console.error('Manager analytics fetch error:', error);
    res.status(error.statusCode || 503).json({
      ...emptyAnalytics(period),
      message: error.message,
    });
  }
};
