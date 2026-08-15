const PERIODS = ['7d', '30d', '12m'];

function periodWindow(periodKey, now = new Date()) {
  const period = PERIODS.includes(periodKey) ? periodKey : '7d';
  const start = new Date(now);
  if (period === '12m') {
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    start.setMonth(start.getMonth() - 11);
  } else {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (period === '30d' ? 29 : 6));
  }
  return { period, start };
}

function bucketKey(date, period) {
  const value = new Date(date);
  return period === '12m'
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
    : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function buildBuckets(period, now) {
  const count = period === '12m' ? 12 : period === '30d' ? 30 : 7;
  const buckets = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    if (period === '12m') date.setMonth(date.getMonth() - index, 1);
    else date.setDate(date.getDate() - index);
    buckets.push({
      key: bucketKey(date, period),
      label: period === '12m'
        ? date.toLocaleString('en-US', { month: 'short', year: '2-digit' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      created: 0,
      resolved: 0
    });
  }
  return buckets;
}

function namedCounts(values, preferredOrder = []) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const keys = [...new Set([...preferredOrder, ...counts.keys()])];
  return keys.map((label) => ({ label, value: counts.get(label) || 0 }));
}

function buildAnalytics(tickets, orders, periodKey, now = new Date(), procurements = [], authorizations = []) {
  const { period, start } = periodWindow(periodKey, now);
  const createdTickets = tickets.filter((ticket) => new Date(ticket.createdAt) >= start);
  const resolvedTickets = tickets.filter((ticket) => ticket.resolvedAt && new Date(ticket.resolvedAt) >= start);
  const periodOrders = orders.filter((order) => new Date(order.createdAt) >= start);
  const buckets = buildBuckets(period, now);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  createdTickets.forEach((ticket) => {
    const bucket = byKey.get(bucketKey(ticket.createdAt, period));
    if (bucket) bucket.created += 1;
  });
  resolvedTickets.forEach((ticket) => {
    const bucket = byKey.get(bucketKey(ticket.resolvedAt, period));
    if (bucket) bucket.resolved += 1;
  });

  const resolutionHours = resolvedTickets
    .map((ticket) => (new Date(ticket.resolvedAt) - new Date(ticket.createdAt)) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  const pending = orders.filter((order) => ['pending-manager', 'pending-approval', 'pending-finance'].includes(order.status));
  const approvalStatuses = ['pending-manager', 'pending-finance', 'approved', 'ordered', 'partially-received', 'received', 'rejected'];
  const approvalSummary = approvalStatuses.map((status) => {
    const matching = periodOrders.filter((order) => order.status === status);
    return {
      status,
      count: matching.length,
      value: matching.reduce((sum, order) => sum + Number(order.totalEstimate || 0), 0)
    };
  });

  const workload = new Map();
  createdTickets.filter((ticket) => ticket.assignedTo).forEach((ticket) => {
    workload.set(ticket.assignedTo, (workload.get(ticket.assignedTo) || 0) + 1);
  });

  const periodProcurements = procurements.filter((receipt) => new Date(receipt.receivedDate || receipt.createdAt) >= start);
  const periodAuthorizations = authorizations.filter((authorization) => new Date(authorization.createdAt) >= start);
  const nonPo = periodProcurements.filter((receipt) => receipt.receiptMode === 'NON_PO');
  const emergency = nonPo.filter((receipt) => receipt.nonPoReason === 'EMERGENCY_REPAIR');
  const totalProcurementValue = periodProcurements.reduce((sum, receipt) => sum + Number(receipt.totalCost || 0), 0);
  const nonPoValue = nonPo.reduce((sum, receipt) => sum + Number(receipt.totalCost || 0), 0);
  const approvalTimes = periodAuthorizations
    .filter((authorization) => authorization.approvedAt)
    .map((authorization) => (new Date(authorization.approvedAt) - new Date(authorization.createdAt)) / 3600000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  const reasonMap = new Map();
  for (const receipt of nonPo) {
    const key = receipt.nonPoReason || 'OTHER';
    const current = reasonMap.get(key) || { label: key, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(receipt.totalCost || 0);
    reasonMap.set(key, current);
  }
  const skuCounts = new Map();
  nonPo.forEach((receipt) => skuCounts.set(receipt.sku, (skuCounts.get(receipt.sku) || 0) + 1));
  const orderedQuantity = orders.reduce((sum, order) => sum + (order.items || [])
    .reduce((lineSum, line) => lineSum + Number(line.orderedQuantity ?? line.quantity ?? 0), 0), 0);
  const receivedQuantity = orders.reduce((sum, order) => sum + (order.items || [])
    .reduce((lineSum, line) => lineSum + Number(line.receivedQuantity || 0), 0), 0);

  return {
    period,
    kpis: {
      ticketsCreated: createdTickets.length,
      ticketsResolved: resolvedTickets.length,
      avgResolutionHours: resolutionHours.length
        ? Math.round((resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length) * 10) / 10
        : 0,
      pendingApprovalValue: pending.reduce((sum, order) => sum + Number(order.totalEstimate || 0), 0)
    },
    ticketTrend: {
      labels: buckets.map((bucket) => bucket.label),
      created: buckets.map((bucket) => bucket.created),
      resolved: buckets.map((bucket) => bucket.resolved)
    },
    ticketStatus: namedCounts(tickets.map((ticket) => ticket.status), ['open', 'in-progress', 'escalated', 'resolved']),
    serviceTypes: namedCounts(createdTickets.map((ticket) => ticket.category), ['installation', 'repair', 'maintenance', 'inspection']),
    technicianWorkload: [...workload.entries()]
      .map(([name, assigned]) => ({ name, assigned }))
      .sort((left, right) => right.assigned - left.assigned),
    approvalSummary,
    procurementSignals: {
      orderedQuantity,
      receivedQuantity,
      nonPoCount: nonPo.length,
      nonPoValue,
      emergencyCount: emergency.length,
      emergencyValue: emergency.reduce((sum, receipt) => sum + Number(receipt.totalCost || 0), 0),
      nonPoPercentage: totalProcurementValue ? Math.round((nonPoValue / totalProcurementValue) * 1000) / 10 : 0,
      averageApprovalHours: approvalTimes.length
        ? Math.round((approvalTimes.reduce((sum, value) => sum + value, 0) / approvalTimes.length) * 10) / 10 : 0,
      awaitingFinance: authorizations.filter((authorization) => authorization.receivedQuantity > 0 && authorization.financeReviewStatus === 'pending').length,
      awaitingReceipt: authorizations.filter((authorization) => ['approved', 'partially-received'].includes(authorization.status)).length,
      byReason: [...reasonMap.values()],
      repeatedSkus: [...skuCounts.entries()].filter(([, count]) => count > 1).map(([sku, count]) => ({ sku, count })),
      authorizedValue: periodAuthorizations.reduce((sum, authorization) => sum + Number(authorization.estimatedTotal || 0), 0),
      receivedAuthorizedValue: periodAuthorizations.reduce((sum, authorization) => sum + Number(authorization.receivedQuantity || 0) * Number(authorization.unitCost || 0), 0),
    },
  };
}

module.exports = { periodWindow, buildAnalytics };
