const analyticsService = require('./manager.analytics.service');
const { buildAnalytics } = require('../../utils/manager-metrics');

function emptyAnalytics(period) {
  const generatedAt = new Date();
  return {
    ...buildAnalytics([], [], period, generatedAt),
    status: 'Offline',
    generatedAt,
    inventorySignals: { lowStockAlerts: 0, outOfStockAlerts: 0, reservedItems: 0, pendingRequests: 0 },
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
