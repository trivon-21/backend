const analyticsService = require("./manager.analytics.service");

/**
 * Handles analytics data retrieval for the Manager → Analytics & Reports screen.
 * Returns a safe, zeroed offline shape if the aggregation service fails so the
 * frontend never breaks on a partial backend.
 */
exports.getAnalytics = async (req, res) => {
  try {
    const period = req.query.period || "7d";
    const data = await analyticsService.getAnalyticsData(req.user, period);
    res.json(data);
  } catch (error) {
    console.error("Manager analytics fetch error:", error);
    res.json({
      period: req.query.period || "7d",
      status: "Offline",
      generatedAt: new Date(),
      kpis: {
        revenue: { label: "Total Revenue", value: 0, unit: "currency", delta: 0, trend: "up", positive: true, icon: "dollar-sign" },
        jobsCompleted: { label: "Jobs Completed", value: 0, unit: "count", delta: 0, trend: "up", positive: true, icon: "circle-check-big" },
        avgResolution: { label: "Avg. Resolution", value: 0, unit: "hours", delta: 0, trend: "down", positive: true, icon: "timer" },
        csat: { label: "Customer Satisfaction", value: 0, unit: "percent", delta: 0, trend: "up", positive: true, icon: "smile" },
      },
      revenueTrend: { labels: [], revenue: [], jobs: [] },
      ticketStatus: [],
      serviceTypes: [],
      technicians: [],
      inventorySignals: { lowStockAlerts: 0, reservedItems: 0, pendingRequests: 0 },
    });
  }
};
