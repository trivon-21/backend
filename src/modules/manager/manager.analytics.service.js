const mongoose = require('mongoose');
const Inventory = require('../../models/Inventory');
const MaterialRequest = require('../../models/MaterialRequest');

/**
 * Manager Analytics Service
 *
 * Produces the aggregated metrics that power the Manager → Analytics & Reports
 * screen. Live inventory signals are read from the database where available and
 * married with operational service metrics (tickets, revenue, technicians) so
 * the page renders a complete managerial picture regardless of which upstream
 * modules are online yet. Falls back gracefully when the database is offline.
 */

const PERIODS = {
  '7d': { points: 7, unit: 'day' },
  '30d': { points: 30, unit: 'day' },
  '12m': { points: 12, unit: 'month' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Small deterministic pseudo-random generator so the mock trend is stable
 * across requests for the same period (avoids charts jumping on every refresh).
 */
function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildTrend(period) {
  const cfg = PERIODS[period] || PERIODS['7d'];
  const rand = seeded(cfg.points * 97 + 13);
  const now = new Date();
  const labels = [];
  const revenue = [];
  const jobs = [];

  for (let i = cfg.points - 1; i >= 0; i--) {
    const d = new Date(now);
    if (cfg.unit === 'day') {
      d.setDate(now.getDate() - i);
      labels.push(cfg.points > 10 ? `${d.getMonth() + 1}/${d.getDate()}` : DAY_LABELS[d.getDay()]);
    } else {
      d.setMonth(now.getMonth() - i);
      labels.push(MONTH_LABELS[d.getMonth()]);
    }

    // Base revenue scaled by period granularity with a gentle upward drift + noise.
    const base = cfg.unit === 'month' ? 42000 : 5200;
    const drift = (cfg.points - i) / cfg.points; // 0 → 1 across the window
    const noise = 0.75 + rand() * 0.5;
    const weekendDip = cfg.unit === 'day' && (d.getDay() === 0 || d.getDay() === 6) ? 0.6 : 1;
    const rev = Math.round(base * (0.8 + drift * 0.5) * noise * weekendDip);
    revenue.push(rev);

    const jobBase = cfg.unit === 'month' ? 210 : 26;
    jobs.push(Math.round(jobBase * (0.85 + drift * 0.35) * (0.8 + rand() * 0.4) * weekendDip));
  }

  return { labels, revenue, jobs };
}

function pct(curr, prev) {
  if (!prev) return 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

exports.getAnalyticsData = async (user, periodKey) => {
  const period = PERIODS[periodKey] ? periodKey : '7d';
  const trend = buildTrend(period);

  // ── Live inventory signals (read-only) ──────────────────────────────
  let lowStockAlerts = 0;
  let reservedItems = 0;
  let pendingRequests = 0;
  try {
    const inventory = await Inventory.find();
    lowStockAlerts = inventory.filter((i) => i.status && i.status !== 'normal').length;
    reservedItems = inventory.reduce((sum, i) => sum + (i.reserved || 0), 0);
    const requests = await MaterialRequest.find({ status: 'pending' });
    pendingRequests = requests.length;
  } catch (err) {
    console.error('Analytics: inventory read failed, using operational mocks only.', err);
  }

  // ── Headline KPIs (current window vs previous window) ───────────────
  const totalRevenue = trend.revenue.reduce((a, b) => a + b, 0);
  const totalJobs = trend.jobs.reduce((a, b) => a + b, 0);
  const prevRevenue = Math.round(totalRevenue * (0.86 + (totalRevenue % 7) / 100));
  const prevJobs = Math.round(totalJobs * 0.92);

  const avgResolution = period === '12m' ? 26.4 : 18.7; // hours
  const prevResolution = avgResolution * 1.09;
  const csat = 94.2;
  const prevCsat = 92.1;

  const kpis = {
    revenue: {
      label: 'Total Revenue',
      value: totalRevenue,
      unit: 'currency',
      delta: pct(totalRevenue, prevRevenue),
      trend: totalRevenue >= prevRevenue ? 'up' : 'down',
      positive: true,
      icon: 'dollar-sign',
    },
    jobsCompleted: {
      label: 'Jobs Completed',
      value: totalJobs,
      unit: 'count',
      delta: pct(totalJobs, prevJobs),
      trend: totalJobs >= prevJobs ? 'up' : 'down',
      positive: true,
      icon: 'circle-check-big',
    },
    avgResolution: {
      label: 'Avg. Resolution',
      value: avgResolution,
      unit: 'hours',
      delta: pct(avgResolution, prevResolution),
      // A drop in resolution time is an improvement.
      trend: avgResolution <= prevResolution ? 'down' : 'up',
      positive: avgResolution <= prevResolution,
      icon: 'timer',
    },
    csat: {
      label: 'Customer Satisfaction',
      value: csat,
      unit: 'percent',
      delta: pct(csat, prevCsat),
      trend: csat >= prevCsat ? 'up' : 'down',
      positive: csat >= prevCsat,
      icon: 'smile',
    },
  };

  // ── Ticket status breakdown (donut) ─────────────────────────────────
  const ticketStatus = [
    { label: 'Resolved', value: 148 },
    { label: 'In Progress', value: 42 },
    { label: 'Open', value: 27 },
    { label: 'Escalated', value: 6 + lowStockAlerts },
  ];

  // ── Service type distribution (horizontal bars) ─────────────────────
  const serviceTypes = [
    { label: 'Installation', value: 38 },
    { label: 'Repair', value: 31 },
    { label: 'Maintenance', value: 22 },
    { label: 'Inspection', value: 9 },
  ];

  // ── Technician performance (ranked bars) ────────────────────────────
  const technicians = [
    { name: 'A. Fernando', jobs: 47, rating: 4.9 },
    { name: 'M. Perera', jobs: 41, rating: 4.7 },
    { name: 'S. Jayasuriya', jobs: 38, rating: 4.8 },
    { name: 'R. De Silva', jobs: 33, rating: 4.5 },
    { name: 'K. Bandara', jobs: 29, rating: 4.6 },
  ];

  return {
    period,
    status: mongoose.connection.readyState === 1 ? 'Operational' : 'Offline',
    generatedAt: new Date(),
    kpis,
    revenueTrend: { labels: trend.labels, revenue: trend.revenue, jobs: trend.jobs },
    ticketStatus,
    serviceTypes,
    technicians,
    inventorySignals: { lowStockAlerts, reservedItems, pendingRequests },
  };
};
