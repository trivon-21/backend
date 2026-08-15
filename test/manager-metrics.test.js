const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnalytics, periodWindow } = require('../src/utils/manager-metrics');

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
