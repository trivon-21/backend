const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalytics, comparisonMetric, periodWindow } = require('../src/utils/manager-metrics');

test('periodWindow creates inclusive reporting boundaries', () => {
  const now = new Date(2026, 7, 15, 12);
  const sevenDays = periodWindow('7d', now).start;
  const thirtyDays = periodWindow('30d', now).start;
  const twelveMonths = periodWindow('12m', now).start;
  assert.deepEqual([sevenDays.getFullYear(), sevenDays.getMonth(), sevenDays.getDate(), sevenDays.getHours()], [2026, 7, 9, 0]);
  assert.deepEqual([thirtyDays.getFullYear(), thirtyDays.getMonth(), thirtyDays.getDate(), thirtyDays.getHours()], [2026, 6, 17, 0]);
  assert.deepEqual([twelveMonths.getFullYear(), twelveMonths.getMonth(), twelveMonths.getDate(), twelveMonths.getHours()], [2025, 8, 1, 0]);
  assert.equal(periodWindow('invalid', now).period, '7d');
});

test('buildAnalytics uses ticket, resolution and approval records only', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const tickets = [
    { createdAt: '2026-08-15T08:00:00.000Z', resolvedAt: '2026-08-15T10:00:00.000Z', status: 'resolved', category: 'repair', assignedTo: 'Tech One' },
    { createdAt: '2026-08-14T08:00:00.000Z', status: 'open', category: 'installation', assignedTo: '' },
    { createdAt: '2026-07-01T08:00:00.000Z', resolvedAt: '2026-08-13T08:00:00.000Z', status: 'resolved', category: 'maintenance', assignedTo: 'Tech Two' },
  ];
  const orders = [
    { createdAt: '2026-08-15T08:00:00.000Z', status: 'pending-approval', totalEstimate: 12500 },
    { createdAt: '2026-08-14T08:00:00.000Z', status: 'approved', totalEstimate: 5000 },
  ];
  const result = buildAnalytics(tickets, orders, '7d', now);

  assert.equal(result.kpis.ticketsCreated, 2);
  assert.equal(result.kpis.ticketsResolved, 2);
  assert.equal(result.kpis.pendingApprovalValue, 12500);
  assert.equal(result.technicianWorkload[0].name, 'Tech One');
  assert.equal(result.approvalSummary.find((item) => item.status === 'approved').count, 1);
  assert.equal(Object.hasOwn(result.kpis, 'revenue'), false);
  assert.equal(Object.hasOwn(result.kpis, 'csat'), false);
});

test('buildAnalytics reports real PO and Non-PO controls', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const orders = [{
    createdAt: '2026-08-14T08:00:00.000Z', status: 'partially-received', totalEstimate: 1000,
    items: [{ orderedQuantity: 5, receivedQuantity: 2 }],
  }];
  const procurements = [
    { receivedDate: '2026-08-15T08:00:00.000Z', receiptMode: 'NON_PO', nonPoReason: 'EMERGENCY_REPAIR', sku: 'CAP-01', totalCost: 500 },
    { receivedDate: '2026-08-14T08:00:00.000Z', receiptMode: 'PO', sku: 'FILTER-01', totalCost: 1500 },
  ];
  const authorizations = [{
    createdAt: '2026-08-14T06:00:00.000Z', approvedAt: '2026-08-14T08:00:00.000Z',
    status: 'completed', financeReviewStatus: 'pending', authorizedQuantity: 2,
    receivedQuantity: 2, unitCost: 250, estimatedTotal: 500,
  }];
  const result = buildAnalytics([], orders, '7d', now, procurements, authorizations);
  assert.equal(result.procurementSignals.orderedQuantity, 5);
  assert.equal(result.procurementSignals.receivedQuantity, 2);
  assert.equal(result.procurementSignals.nonPoCount, 1);
  assert.equal(result.procurementSignals.emergencyCount, 1);
  assert.equal(result.procurementSignals.nonPoPercentage, 25);
  assert.equal(result.procurementSignals.awaitingFinance, 1);
});

test('financial analytics reconcile collected revenue, received spend, and current exposure', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const tickets = [
    { sourceType: 'service', paymentStatus: 'APPROVED', serviceFee: 200, approvedAt: '2026-08-14T09:00:00.000Z' },
    { sourceType: 'inspection-ticket', sourceStatus: 'INSPECTION_SCHEDULED', inspectionFee: 50, approvedAt: '2026-08-14T10:00:00.000Z' },
    { sourceType: 'maintenance', paymentStatus: 'UNDER_REVIEW', serviceFee: 75 },
  ];
  const purchaseOrders = [{
    status: 'partially-received', totalEstimate: 500,
    items: [{ orderedQuantity: 5, receivedQuantity: 2, unitCost: 100 }],
  }];
  const procurements = [{
    receiptMode: 'PO', receivedDate: '2026-08-14T11:00:00.000Z', totalCost: 400,
  }];
  const authorizations = [{
    status: 'completed', financeReviewStatus: 'pending', receivedQuantity: 2, unitCost: 25,
  }];
  const customerOrders = [
    { _id: 'order-standalone', paymentStatus: 'Approved', amount: 500, approvedAt: '2026-08-14T12:00:00.000Z' },
    { _id: 'order-invoiced', paymentStatus: 'Approved', amount: 1000, approvedAt: '2026-08-14T12:30:00.000Z' },
    { paymentStatus: 'Under Review', total: 300 },
  ];
  const invoices = [
    { status: 'PAID', orderId: 'order-invoiced', grandTotal: 1000, paidAt: '2026-08-14T13:00:00.000Z' },
    { status: 'ACCEPTED', grandTotal: 600 },
  ];

  const result = buildAnalytics(
    tickets, purchaseOrders, '7d', now, procurements, authorizations, [], 0, customerOrders, invoices,
  );

  assert.equal(result.financial.collectedRevenue.current, 1750);
  assert.equal(result.financial.procurementSpend.current, 400);
  assert.equal(result.financial.operatingContribution.current, 1350);
  assert.deepEqual(
    { count: result.financial.outstandingReceivables.count, value: result.financial.outstandingReceivables.value },
    { count: 3, value: 975 },
  );
  assert.deepEqual(
    { count: result.financial.pendingPaymentReview.count, value: result.financial.pendingPaymentReview.value },
    { count: 2, value: 375 },
  );
  assert.equal(result.financial.purchaseCommitments.value, 300);
  assert.equal(result.financial.unreconciledNonPo.value, 50);
  assert.equal(result.financial.trend.collectedRevenue.reduce((total, value) => total + value, 0), 1750);
  assert.equal(result.financial.basis, 'cash-collected-vs-goods-received');
  assert.ok(result.dataCoverage.some((item) => item.key === 'financial-margin' && item.status === 'unavailable'));
});

test('period windows are adjacent and do not double count the current boundary', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const window = periodWindow('7d', now);
  assert.equal(window.previousEnd.getTime(), window.currentStart.getTime());

  const tickets = [
    { createdAt: new Date(window.previousStart.getTime()), status: 'open', category: 'repair' },
    { createdAt: new Date(window.currentStart.getTime() - 1), status: 'open', category: 'repair' },
    { createdAt: new Date(window.currentStart.getTime()), status: 'open', category: 'repair' },
    { createdAt: new Date(window.currentEnd.getTime()), status: 'open', category: 'repair' },
  ];
  const result = buildAnalytics(tickets, [], '7d', now);
  assert.equal(result.performance.ticketsCreated.current, 2);
  assert.equal(result.performance.ticketsCreated.previous, 2);
});

test('comparison metrics never return infinity for a zero previous value', () => {
  assert.deepEqual(comparisonMetric(0, 0), {
    current: 0, previous: 0, deltaPercent: null, deltaKind: 'no-change', semantic: 'neutral',
  });
  assert.deepEqual(comparisonMetric(4, 0), {
    current: 4, previous: 0, deltaPercent: null, deltaKind: 'new', semantic: 'neutral',
  });
  assert.equal(comparisonMetric(6, 4).deltaPercent, 50);
});

test('current snapshots remain stable when the reporting period changes', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const tickets = [
    { createdAt: '2026-01-01T00:00:00.000Z', status: 'open', assignedTo: '', slaDueAt: '2026-08-15T10:00:00.000Z' },
    { createdAt: '2026-08-15T08:00:00.000Z', status: 'resolved', resolvedAt: '2026-08-15T10:00:00.000Z' },
  ];
  const orders = [{ createdAt: '2026-01-01T00:00:00.000Z', status: 'pending-manager', totalEstimate: 1000 }];
  const inventory = [{ name: 'Capacitor', sku: 'CAP-1', available: 0, reserved: 2, reorderLevel: 3 }];
  const sevenDays = buildAnalytics(tickets, orders, '7d', now, [], [], inventory, 1);
  const twelveMonths = buildAnalytics(tickets, orders, '12m', now, [], [], inventory, 1);
  assert.deepEqual(sevenDays.currentPosition, twelveMonths.currentPosition);
  assert.deepEqual(sevenDays.inventoryRisk, twelveMonths.inventoryRisk);
});

test('approval reporting uses decision history events rather than current order status', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const orders = [{
    createdAt: '2026-07-01T08:00:00.000Z',
    status: 'received',
    totalEstimate: 2500,
    decisionHistory: [
      { stage: 'manager', decision: 'submitted', at: '2026-08-10T08:00:00.000Z' },
      { stage: 'manager', decision: 'approved', at: '2026-08-10T10:00:00.000Z' },
      { stage: 'finance', decision: 'approved', at: '2026-08-10T13:00:00.000Z' },
    ],
  }];
  const result = buildAnalytics([], orders, '7d', now);
  assert.equal(result.purchasing.periodDecisions.find((row) => row.stage === 'manager' && row.decision === 'approved').count, 1);
  assert.equal(result.purchasing.periodDecisions.find((row) => row.stage === 'finance' && row.decision === 'approved').count, 1);
  assert.equal(result.purchasing.averageManagerApprovalHours, 2);
  assert.equal(result.purchasing.averageFinanceApprovalHours, 3);
  assert.equal(result.purchasing.currentPipeline.find((row) => row.status === 'received').count, 1);
});

test('workload is a current assignment snapshot and stock risks are ranked', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const tickets = [
    { createdAt: '2026-01-01T00:00:00.000Z', status: 'escalated', assignedTo: 'Tech One' },
    { createdAt: '2026-01-02T00:00:00.000Z', status: 'open', assignedTo: 'Tech One', slaDueAt: '2026-08-16T08:00:00.000Z' },
    { createdAt: '2026-08-14T00:00:00.000Z', resolvedAt: '2026-08-15T08:00:00.000Z', status: 'resolved', assignedTo: 'Tech Two' },
  ];
  const inventory = [
    { _id: '1', name: 'Low', sku: 'LOW', available: 2, reserved: 0, reorderLevel: 3 },
    { _id: '2', name: 'Empty', sku: 'EMPTY', available: 0, reserved: 1, reorderLevel: 3 },
  ];
  const result = buildAnalytics(tickets, [], '7d', now, [], [], inventory);
  const techOne = result.workforce.currentWorkload.find((row) => row.name === 'Tech One');
  assert.deepEqual(techOne, { name: 'Tech One', active: 2, slaRisk: 2, escalated: 1, awaitingAction: 1, completedInPeriod: 0 });
  assert.equal(result.inventoryRisk.topRisks[0].status, 'out-of-stock');
  assert.equal(result.inventoryRisk.topRisks[1].status, 'low-stock');
});
