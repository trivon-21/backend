const { deriveStockStatus } = require('./inventory-domain');

const PERIODS = ['7d', '30d', '12m'];
const ACTIVE_TICKET_STATUSES = ['open', 'in-progress', 'escalated'];
const PURCHASE_STATUSES = [
  'pending-manager', 'pending-finance', 'approved', 'ordered',
  'partially-received', 'received', 'rejected', 'cancelled',
];

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function periodWindow(periodKey, now = new Date()) {
  const period = PERIODS.includes(periodKey) ? periodKey : '7d';
  const currentEnd = new Date(now);
  const currentStart = startOfDay(now);
  if (period === '12m') {
    currentStart.setDate(1);
    currentStart.setMonth(currentStart.getMonth() - 11);
  } else {
    currentStart.setDate(currentStart.getDate() - (period === '30d' ? 29 : 6));
  }

  const previousEnd = new Date(currentStart);
  const previousStart = new Date(currentStart);
  if (period === '12m') previousStart.setMonth(previousStart.getMonth() - 12);
  else previousStart.setDate(previousStart.getDate() - (period === '30d' ? 30 : 7));

  return {
    period,
    start: currentStart,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  };
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inWindow(value, start, end, includeEnd = false) {
  const date = validDate(value);
  if (!date) return false;
  return date >= start && (includeEnd ? date <= end : date < end);
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
    const date = startOfDay(now);
    if (period === '12m') date.setMonth(date.getMonth() - index, 1);
    else date.setDate(date.getDate() - index);
    buckets.push({
      key: bucketKey(date, period),
      label: period === '12m'
        ? date.toLocaleString('en-US', { month: 'short', year: '2-digit' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      created: 0,
      resolved: 0,
      revenue: 0,
      spend: 0,
    });
  }
  return buckets;
}

function namedCounts(values, preferredOrder = []) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const keys = [...new Set([...preferredOrder, ...counts.keys()])];
  return keys.map((label) => ({ label, value: counts.get(label) || 0 }));
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function comparisonMetric(current, previous, semantic = 'neutral') {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (currentValue === 0 && previousValue === 0) {
    return { current: 0, previous: 0, deltaPercent: null, deltaKind: 'no-change', semantic };
  }
  if (previousValue === 0) {
    return { current: currentValue, previous: 0, deltaPercent: null, deltaKind: 'new', semantic };
  }
  return {
    current: currentValue,
    previous: previousValue,
    deltaPercent: round(((currentValue - previousValue) / previousValue) * 100),
    deltaKind: 'percent',
    semantic,
  };
}

function snapshotMetric(value, asOf) {
  return { value: Number(value) || 0, scope: 'current-snapshot', asOf: new Date(asOf) };
}

function sum(items, selector) {
  return items.reduce((total, item) => total + Number(selector(item) || 0), 0);
}

function orderAmount(order) {
  const declared = Number(order.total ?? order.amount ?? order.subtotal ?? 0);
  if (declared > 0) return declared;
  return sum(order.items || [], (item) => Number(item.price ?? item.unitPrice ?? 0) * Number(item.quantity || 1));
}

function currentPurchaseCommitment(orders) {
  return sum(
    orders.filter((order) => ['approved', 'ordered', 'partially-received'].includes(order.status)),
    (order) => {
      if (!(order.items || []).length) return Number(order.totalEstimate || 0);
      return sum(order.items, (line) => {
        const ordered = Number(line.orderedQuantity ?? line.quantity ?? 0);
        const received = Number(line.receivedQuantity || 0);
        return Math.max(0, ordered - received) * Number(line.unitCost || 0);
      });
    },
  );
}

function financialRevenueEntries(tickets, customerOrders, invoices) {
  const entries = [];
  const paidInvoiceOrderIds = new Set(
    invoices.filter((invoice) => invoice.status === 'PAID' && invoice.orderId).map((invoice) => String(invoice.orderId)),
  );
  for (const invoice of invoices) {
    if (invoice.status !== 'PAID') continue;
    entries.push({ source: 'Paid invoices', value: Number(invoice.grandTotal || 0), at: invoice.paidAt || invoice.updatedAt, fallbackDate: !invoice.paidAt });
  }
  for (const order of customerOrders) {
    if (!['Approved', 'Confirmed'].includes(order.paymentStatus) && !['Confirmed', 'Payment Confirmed'].includes(order.status)) continue;
    if (paidInvoiceOrderIds.has(String(order._id || ''))) continue;
    entries.push({ source: 'Product order payments', value: orderAmount(order), at: order.approvedAt || order.updatedAt, fallbackDate: !order.approvedAt });
  }
  for (const ticket of tickets) {
    if (['service', 'maintenance'].includes(ticket.sourceType) && ticket.paymentStatus === 'APPROVED') {
      entries.push({ source: 'Service payments', value: Number(ticket.serviceFee || 0), at: ticket.approvedAt || ticket.updatedAt, fallbackDate: !ticket.approvedAt });
    }
    if (ticket.sourceType === 'inspection-ticket'
      && ['PAYMENT_CONFIRMED', 'INSPECTION_SCHEDULED', 'ONGOING', 'REPORT_RECORDED', 'INSPECTED'].includes(ticket.sourceStatus)) {
      entries.push({ source: 'Inspection payments', value: Number(ticket.inspectionFee || 0), at: ticket.approvedAt || ticket.updatedAt, fallbackDate: !ticket.approvedAt });
    }
  }
  return entries.filter((entry) => entry.value > 0 && validDate(entry.at));
}

function outstandingReceivables(tickets, customerOrders, invoices) {
  const entries = [];
  const outstandingInvoiceOrderIds = new Set(
    invoices.filter((invoice) => ['ACCEPTED', 'PAYMENT_UNDER_REVIEW'].includes(invoice.status) && invoice.orderId)
      .map((invoice) => String(invoice.orderId)),
  );
  for (const invoice of invoices) {
    if (['ACCEPTED', 'PAYMENT_UNDER_REVIEW'].includes(invoice.status)) entries.push(Number(invoice.grandTotal || 0));
  }
  for (const order of customerOrders) {
    if (outstandingInvoiceOrderIds.has(String(order._id || ''))) continue;
    if (['Pending Payment', 'Under Review'].includes(order.paymentStatus)
      || ['Pending Payment', 'Under Review (Finance)'].includes(order.status)) entries.push(orderAmount(order));
  }
  for (const ticket of tickets) {
    if (['service', 'maintenance'].includes(ticket.sourceType)
      && ['PENDING_PAYMENT', 'UNDER_REVIEW'].includes(ticket.paymentStatus)) entries.push(Number(ticket.serviceFee || 0));
    if (ticket.sourceType === 'inspection-ticket'
      && ['PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW'].includes(ticket.sourceStatus)) entries.push(Number(ticket.inspectionFee || 0));
  }
  return { count: entries.length, value: sum(entries, (value) => value) };
}

function pendingPaymentReview(tickets, customerOrders, invoices) {
  const entries = [];
  const reviewingInvoiceOrderIds = new Set(
    invoices.filter((invoice) => invoice.status === 'PAYMENT_UNDER_REVIEW' && invoice.orderId)
      .map((invoice) => String(invoice.orderId)),
  );
  invoices.filter((invoice) => invoice.status === 'PAYMENT_UNDER_REVIEW').forEach((invoice) => entries.push(Number(invoice.grandTotal || 0)));
  customerOrders.filter((order) => !reviewingInvoiceOrderIds.has(String(order._id || ''))
    && (order.paymentStatus === 'Under Review' || order.status === 'Under Review (Finance)'))
    .forEach((order) => entries.push(orderAmount(order)));
  tickets.filter((ticket) => ['service', 'maintenance'].includes(ticket.sourceType) && ticket.paymentStatus === 'UNDER_REVIEW')
    .forEach((ticket) => entries.push(Number(ticket.serviceFee || 0)));
  tickets.filter((ticket) => ticket.sourceType === 'inspection-ticket' && ticket.sourceStatus === 'PAYMENT_UNDER_REVIEW')
    .forEach((ticket) => entries.push(Number(ticket.inspectionFee || 0)));
  return { count: entries.length, value: sum(entries, (value) => value) };
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value) && value >= 0);
  return usable.length ? round(usable.reduce((total, value) => total + value, 0) / usable.length) : 0;
}

function orderSubmissionAt(order) {
  const event = (order.decisionHistory || []).find((entry) => entry.decision === 'submitted');
  return event?.at || order.createdAt;
}

function decisionEvents(orders, start, end) {
  const events = [];
  for (const order of orders) {
    for (const entry of order.decisionHistory || []) {
      if (!['manager', 'finance'].includes(entry.stage) || !['approved', 'rejected'].includes(entry.decision)) continue;
      if (!inWindow(entry.at, start, end, true)) continue;
      events.push({ stage: entry.stage, decision: entry.decision, at: entry.at, value: Number(order.totalEstimate || 0) });
    }
  }
  return events;
}

function decisionSummary(events) {
  return ['manager', 'finance'].flatMap((stage) => ['approved', 'rejected'].map((decision) => {
    const matches = events.filter((event) => event.stage === stage && event.decision === decision);
    return { stage, decision, count: matches.length, value: sum(matches, (event) => event.value) };
  }));
}

function approvalHours(orders, stage, start, end) {
  const values = [];
  for (const order of orders) {
    const history = order.decisionHistory || [];
    const decision = history.find((entry) => entry.stage === stage
      && ['approved', 'rejected'].includes(entry.decision)
      && inWindow(entry.at, start, end, true));
    if (!decision) continue;
    const origin = stage === 'manager'
      ? orderSubmissionAt(order)
      : history.find((entry) => entry.stage === 'manager' && entry.decision === 'approved')?.at;
    const from = validDate(origin);
    const to = validDate(decision.at);
    if (from && to) values.push((to - from) / 3600000);
  }
  return average(values);
}

function assigneeName(ticket) {
  if (ticket.assignedTo) return ticket.assignedTo;
  if (ticket.assignedTechnicianId && typeof ticket.assignedTechnicianId === 'object') {
    return ticket.assignedTechnicianId.fullName || '';
  }
  return '';
}

function isSlaRisk(ticket, now) {
  if (ticket.status === 'escalated') return true;
  const due = validDate(ticket.slaDueAt);
  return Boolean(due && due <= new Date(new Date(now).getTime() + 24 * 3600000));
}

function buildWorkload(tickets, resolvedInPeriod, now) {
  const rows = new Map();
  const row = (name) => {
    if (!rows.has(name)) rows.set(name, { name, active: 0, slaRisk: 0, escalated: 0, awaitingAction: 0, completedInPeriod: 0 });
    return rows.get(name);
  };
  tickets.filter((ticket) => ACTIVE_TICKET_STATUSES.includes(ticket.status)).forEach((ticket) => {
    const name = assigneeName(ticket);
    if (!name) return;
    const item = row(name);
    item.active += 1;
    if (isSlaRisk(ticket, now)) item.slaRisk += 1;
    if (ticket.status === 'escalated') item.escalated += 1;
    if (ticket.status === 'open') item.awaitingAction += 1;
  });
  resolvedInPeriod.forEach((ticket) => {
    const name = assigneeName(ticket);
    if (name) row(name).completedInPeriod += 1;
  });
  return [...rows.values()].sort((left, right) => right.active - left.active || right.slaRisk - left.slaRisk);
}

function buildStockRisk(inventory) {
  return inventory
    .map((item) => ({
      id: String(item._id || ''),
      name: item.name || 'Unnamed item',
      sku: item.sku || '',
      available: Number(item.available || 0),
      reserved: Number(item.reserved || 0),
      reorderLevel: Number(item.reorderLevel || 0),
      status: deriveStockStatus(item.available, item.reorderLevel),
    }))
    .filter((item) => item.status !== 'in-stock')
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === 'out-of-stock' ? -1 : 1;
      return left.available - right.available || right.reserved - left.reserved;
    })
    .slice(0, 8);
}

function buildAnalytics(
  tickets,
  orders,
  periodKey,
  now = new Date(),
  procurements = [],
  authorizations = [],
  inventory = [],
  pendingMaterialRequests = 0,
  customerOrders = [],
  invoices = [],
) {
  const window = periodWindow(periodKey, now);
  const { period, currentStart, currentEnd, previousStart, previousEnd } = window;
  const currentTickets = tickets.filter((ticket) => inWindow(ticket.createdAt, currentStart, currentEnd, true));
  const previousTickets = tickets.filter((ticket) => inWindow(ticket.createdAt, previousStart, previousEnd));
  const currentResolved = tickets.filter((ticket) => inWindow(ticket.resolvedAt, currentStart, currentEnd, true));
  const previousResolved = tickets.filter((ticket) => inWindow(ticket.resolvedAt, previousStart, previousEnd));
  const currentSubmissions = orders.filter((order) => inWindow(orderSubmissionAt(order), currentStart, currentEnd, true));
  const previousSubmissions = orders.filter((order) => inWindow(orderSubmissionAt(order), previousStart, previousEnd));
  const currentDecisions = decisionEvents(orders, currentStart, currentEnd);
  const previousDecisions = decisionEvents(orders, previousStart, previousEnd);
  const revenueEntries = financialRevenueEntries(tickets, customerOrders, invoices);
  const currentRevenueEntries = revenueEntries.filter((entry) => inWindow(entry.at, currentStart, currentEnd, true));
  const previousRevenueEntries = revenueEntries.filter((entry) => inWindow(entry.at, previousStart, previousEnd));
  const currentProcurements = procurements.filter((receipt) => inWindow(receipt.receivedDate || receipt.createdAt, currentStart, currentEnd, true));
  const previousProcurements = procurements.filter((receipt) => inWindow(receipt.receivedDate || receipt.createdAt, previousStart, previousEnd));

  const resolutionAverage = (items) => average(items.map((ticket) => {
    const resolved = validDate(ticket.resolvedAt);
    const created = validDate(ticket.createdAt);
    return resolved && created ? (resolved - created) / 3600000 : Number.NaN;
  }));

  const buckets = buildBuckets(period, now);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  currentTickets.forEach((ticket) => { const bucket = byKey.get(bucketKey(ticket.createdAt, period)); if (bucket) bucket.created += 1; });
  currentResolved.forEach((ticket) => { const bucket = byKey.get(bucketKey(ticket.resolvedAt, period)); if (bucket) bucket.resolved += 1; });
  currentRevenueEntries.forEach((entry) => { const bucket = byKey.get(bucketKey(entry.at, period)); if (bucket) bucket.revenue += entry.value; });
  currentProcurements.forEach((receipt) => {
    const at = receipt.receivedDate || receipt.createdAt;
    const bucket = byKey.get(bucketKey(at, period));
    if (bucket) bucket.spend += Number(receipt.totalCost || 0);
  });

  const activeTickets = tickets.filter((ticket) => ACTIVE_TICKET_STATUSES.includes(ticket.status));
  const unassignedTickets = activeTickets.filter((ticket) => !assigneeName(ticket));
  const pendingOrders = orders.filter((order) => ['pending-manager', 'pending-approval', 'pending-finance'].includes(order.status));
  const stockRisks = buildStockRisk(inventory);
  const outOfStock = inventory.filter((item) => deriveStockStatus(item.available, item.reorderLevel) === 'out-of-stock');
  const lowStock = inventory.filter((item) => deriveStockStatus(item.available, item.reorderLevel) === 'low-stock');

  const pipeline = PURCHASE_STATUSES.map((status) => {
    const matching = orders.filter((order) => order.status === status || (status === 'pending-manager' && order.status === 'pending-approval'));
    return { status, count: matching.length, value: sum(matching, (order) => order.totalEstimate) };
  });

  const orderedQuantity = sum(orders, (order) => sum(order.items || [], (line) => line.orderedQuantity ?? line.quantity));
  const receivedQuantity = sum(orders, (order) => sum(order.items || [], (line) => line.receivedQuantity));
  const orderedValue = sum(orders, (order) => sum(order.items || [], (line) => Number((line.orderedQuantity ?? line.quantity) || 0) * Number(line.unitCost || 0)));
  const receivedValue = sum(orders, (order) => sum(order.items || [], (line) => Number(line.receivedQuantity || 0) * Number(line.unitCost || 0)));

  const periodProcurements = currentProcurements;
  const periodAuthorizations = authorizations.filter((authorization) => inWindow(authorization.createdAt, currentStart, currentEnd, true));
  const nonPo = periodProcurements.filter((receipt) => receipt.receiptMode === 'NON_PO');
  const emergency = nonPo.filter((receipt) => receipt.nonPoReason === 'EMERGENCY_REPAIR');
  const totalProcurementValue = sum(periodProcurements, (receipt) => receipt.totalCost);
  const nonPoValue = sum(nonPo, (receipt) => receipt.totalCost);
  const previousProcurementValue = sum(previousProcurements, (receipt) => receipt.totalCost);
  const collectedRevenue = sum(currentRevenueEntries, (entry) => entry.value);
  const previousCollectedRevenue = sum(previousRevenueEntries, (entry) => entry.value);
  const contribution = collectedRevenue - totalProcurementValue;
  const previousContribution = previousCollectedRevenue - previousProcurementValue;
  const revenueSourceMap = new Map();
  for (const entry of currentRevenueEntries) {
    const row = revenueSourceMap.get(entry.source) || { label: entry.source, count: 0, value: 0 };
    row.count += 1;
    row.value += entry.value;
    revenueSourceMap.set(entry.source, row);
  }
  const spendModeMap = new Map();
  for (const receipt of periodProcurements) {
    const label = receipt.receiptMode === 'NON_PO' ? 'Non-PO receipts' : 'Purchase-order receipts';
    const row = spendModeMap.get(label) || { label, count: 0, value: 0 };
    row.count += 1;
    row.value += Number(receipt.totalCost || 0);
    spendModeMap.set(label, row);
  }
  const receivables = outstandingReceivables(tickets, customerOrders, invoices);
  const paymentReview = pendingPaymentReview(tickets, customerOrders, invoices);
  const financeSnapshot = (item) => ({ ...item, scope: 'current-snapshot', asOf: new Date(now) });
  const unreconciledNonPo = authorizations.filter((item) =>
    Number(item.receivedQuantity || 0) > 0 && item.financeReviewStatus === 'pending');
  const reasonMap = new Map();
  const supplierMap = new Map();
  const skuCounts = new Map();
  for (const receipt of nonPo) {
    const reason = receipt.nonPoReason || 'OTHER';
    const supplier = receipt.supplierName || 'Unknown supplier';
    const reasonRow = reasonMap.get(reason) || { label: reason, count: 0, value: 0 };
    const supplierRow = supplierMap.get(supplier) || { label: supplier, count: 0, value: 0 };
    reasonRow.count += 1; reasonRow.value += Number(receipt.totalCost || 0); reasonMap.set(reason, reasonRow);
    supplierRow.count += 1; supplierRow.value += Number(receipt.totalCost || 0); supplierMap.set(supplier, supplierRow);
    const sku = receipt.sku || 'Unknown SKU';
    skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }

  const ticketLookup = new Map();
  tickets.forEach((ticket) => {
    if (ticket._id) ticketLookup.set(String(ticket._id), ticket);
    if (ticket.ticketId) ticketLookup.set(String(ticket.ticketId), ticket);
  });
  const receivedEmergencyAuthorizations = periodAuthorizations.filter((authorization) =>
    authorization.nonPoReason === 'EMERGENCY_REPAIR' && Number(authorization.receivedQuantity || 0) > 0);
  const protectedJobs = receivedEmergencyAuthorizations.filter((authorization) => {
    const ticket = ticketLookup.get(String(authorization.affectedWorkId || ''))
      || ticketLookup.get(String(authorization.affectedWorkReference || ''));
    return Boolean(ticket?.slaDueAt);
  }).length;

  const legacySubmissionCount = currentSubmissions.filter((order) =>
    !(order.decisionHistory || []).some((entry) => entry.decision === 'submitted')).length;
  const coverage = [
    { key: 'assignment-history', status: 'unavailable', message: 'Historical assignment changes are not recorded; period completions use the current assignee snapshot.' },
    { key: 'technician-capacity', status: 'unavailable', message: 'Capacity and utilization require technician schedules or working-hour data.' },
    { key: 'service-outcomes', status: 'unavailable', message: 'First-time-fix and callback rates require technician outcome records.' },
    { key: 'financial-margin', status: 'unavailable', message: 'Gross profit and margin are not reported because overhead and cost-of-goods allocation are not recorded against revenue transactions.' },
  ];
  if (legacySubmissionCount) coverage.push({
    key: 'purchase-submission-history', status: 'partial',
    message: `${legacySubmissionCount} purchase request(s) use created time because no submission audit event exists.`,
  });
  if (receivedEmergencyAuthorizations.length && protectedJobs === 0) coverage.push({
    key: 'sla-protection', status: 'partial',
    message: 'Emergency receipts exist, but no linked ticket with SLA data was available to verify delay prevention.',
  });
  const revenueFallbackDates = currentRevenueEntries.filter((entry) => entry.fallbackDate).length;
  if (revenueFallbackDates) coverage.push({
    key: 'financial-event-timestamps',
    status: 'partial',
    message: `${revenueFallbackDates} collected revenue record(s) use their last-updated time because a payment event timestamp is unavailable.`,
  });

  const oldestPendingDate = pendingOrders
    .map((order) => validDate(orderSubmissionAt(order)))
    .filter(Boolean)
    .sort((left, right) => left - right)[0];

  const performance = {
    ticketsCreated: comparisonMetric(currentTickets.length, previousTickets.length),
    ticketsResolved: comparisonMetric(currentResolved.length, previousResolved.length, 'higher-is-better'),
    averageResolutionHours: comparisonMetric(resolutionAverage(currentResolved), resolutionAverage(previousResolved), 'lower-is-better'),
    purchaseRequestCount: comparisonMetric(currentSubmissions.length, previousSubmissions.length),
    purchaseRequestValue: comparisonMetric(sum(currentSubmissions, (order) => order.totalEstimate), sum(previousSubmissions, (order) => order.totalEstimate)),
    managerDecisions: comparisonMetric(currentDecisions.filter((event) => event.stage === 'manager').length, previousDecisions.filter((event) => event.stage === 'manager').length),
    financeDecisions: comparisonMetric(currentDecisions.filter((event) => event.stage === 'finance').length, previousDecisions.filter((event) => event.stage === 'finance').length),
  };

  const currentPosition = {
    openTickets: snapshotMetric(activeTickets.length, now),
    unassignedTickets: snapshotMetric(unassignedTickets.length, now),
    slaRiskTickets: snapshotMetric(activeTickets.filter((ticket) => isSlaRisk(ticket, now)).length, now),
    pendingApprovalValue: snapshotMetric(sum(pendingOrders, (order) => order.totalEstimate), now),
    stockRiskItems: snapshotMetric(stockRisks.length, now),
  };

  const serviceOperations = {
    ticketTrend: { labels: buckets.map((bucket) => bucket.label), created: buckets.map((bucket) => bucket.created), resolved: buckets.map((bucket) => bucket.resolved) },
    currentTicketStatus: namedCounts(tickets.map((ticket) => ticket.status), ['open', 'in-progress', 'escalated', 'resolved']),
    serviceTypes: namedCounts(currentTickets.map((ticket) => ticket.category), ['installation', 'repair', 'maintenance', 'inspection']),
  };
  const workforce = { currentWorkload: buildWorkload(tickets, currentResolved, now), attribution: 'current-assignee' };
  const purchasing = {
    currentPipeline: pipeline,
    periodDecisions: decisionSummary(currentDecisions),
    averageManagerApprovalHours: approvalHours(orders, 'manager', currentStart, currentEnd),
    averageFinanceApprovalHours: approvalHours(orders, 'finance', currentStart, currentEnd),
    poProgress: { orderedQuantity, receivedQuantity, orderedValue, receivedValue },
    pendingApprovalValue: snapshotMetric(sum(pendingOrders, (order) => order.totalEstimate), now),
    oldestPendingAgeHours: oldestPendingDate ? round((new Date(now) - oldestPendingDate) / 3600000) : 0,
  };
  const financial = {
    collectedRevenue: comparisonMetric(collectedRevenue, previousCollectedRevenue, 'higher-is-better'),
    procurementSpend: comparisonMetric(totalProcurementValue, previousProcurementValue),
    operatingContribution: comparisonMetric(contribution, previousContribution, 'higher-is-better'),
    outstandingReceivables: financeSnapshot(receivables),
    pendingPaymentReview: financeSnapshot(paymentReview),
    purchaseCommitments: snapshotMetric(currentPurchaseCommitment(orders), now),
    unreconciledNonPo: financeSnapshot({
      count: unreconciledNonPo.length,
      value: sum(unreconciledNonPo, (item) => Number(item.receivedQuantity || 0) * Number(item.unitCost || 0)),
    }),
    revenueBySource: [...revenueSourceMap.values()].sort((left, right) => right.value - left.value),
    spendByMode: [...spendModeMap.values()].sort((left, right) => right.value - left.value),
    trend: {
      labels: buckets.map((bucket) => bucket.label),
      collectedRevenue: buckets.map((bucket) => round(bucket.revenue, 2)),
      procurementSpend: buckets.map((bucket) => round(bucket.spend, 2)),
    },
    basis: 'cash-collected-vs-goods-received',
  };
  const inventoryRisk = {
    lowStockItems: snapshotMetric(lowStock.length, now),
    outOfStockItems: snapshotMetric(outOfStock.length, now),
    reservedUnits: snapshotMetric(sum(inventory, (item) => item.reserved), now),
    pendingMaterialRequests: snapshotMetric(pendingMaterialRequests, now),
    approvedAwaitingReceipt: snapshotMetric(authorizations.filter((item) => ['approved', 'partially-received'].includes(item.status)).length, now),
    topRisks: stockRisks,
  };
  const exceptions = {
    nonPoCount: nonPo.length,
    nonPoValue,
    emergencyCount: emergency.length,
    emergencyValue: sum(emergency, (receipt) => receipt.totalCost),
    nonPoPercentage: totalProcurementValue ? round((nonPoValue / totalProcurementValue) * 100) : 0,
    averageAuthorizationHours: average(periodAuthorizations.filter((item) => item.approvedAt).map((item) => (new Date(item.approvedAt) - new Date(item.createdAt)) / 3600000)),
    awaitingFinance: snapshotMetric(authorizations.filter((item) => Number(item.receivedQuantity || 0) > 0 && item.financeReviewStatus === 'pending').length, now),
    awaitingReceipt: snapshotMetric(authorizations.filter((item) => ['approved', 'partially-received'].includes(item.status)).length, now),
    byReason: [...reasonMap.values()].sort((left, right) => right.value - left.value),
    bySupplier: [...supplierMap.values()].sort((left, right) => right.value - left.value),
    repeatedSkus: [...skuCounts.entries()].filter(([, count]) => count > 1).map(([sku, count]) => ({ sku, count })).sort((left, right) => right.count - left.count),
    authorizedValue: sum(periodAuthorizations, (item) => item.estimatedTotal),
    receivedAuthorizedValue: sum(periodAuthorizations, (item) => Number(item.receivedQuantity || 0) * Number(item.unitCost || 0)),
    slaProtectedJobs: protectedJobs,
  };

  return {
    period,
    reportingPeriod: { period, currentStart, currentEnd, previousStart, previousEnd },
    performance,
    currentPosition,
    serviceOperations,
    workforce,
    purchasing,
    financial,
    inventoryRisk,
    exceptions,
    dataCoverage: coverage,

    // One-release compatibility projection for older Manager analytics clients.
    kpis: {
      ticketsCreated: performance.ticketsCreated.current,
      ticketsResolved: performance.ticketsResolved.current,
      avgResolutionHours: performance.averageResolutionHours.current,
      pendingApprovalValue: currentPosition.pendingApprovalValue.value,
    },
    ticketTrend: serviceOperations.ticketTrend,
    ticketStatus: serviceOperations.currentTicketStatus,
    serviceTypes: serviceOperations.serviceTypes,
    technicianWorkload: workforce.currentWorkload.map((item) => ({ name: item.name, assigned: item.active })),
    approvalSummary: pipeline,
    procurementSignals: {
      orderedQuantity, receivedQuantity,
      nonPoCount: exceptions.nonPoCount, nonPoValue: exceptions.nonPoValue,
      emergencyCount: exceptions.emergencyCount, emergencyValue: exceptions.emergencyValue,
      nonPoPercentage: exceptions.nonPoPercentage, averageApprovalHours: exceptions.averageAuthorizationHours,
      awaitingFinance: exceptions.awaitingFinance.value, awaitingReceipt: exceptions.awaitingReceipt.value,
      byReason: exceptions.byReason, repeatedSkus: exceptions.repeatedSkus,
      authorizedValue: exceptions.authorizedValue, receivedAuthorizedValue: exceptions.receivedAuthorizedValue,
    },
  };
}

module.exports = {
  periodWindow,
  buildBuckets,
  comparisonMetric,
  snapshotMetric,
  buildAnalytics,
};
