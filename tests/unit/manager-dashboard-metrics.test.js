const assert = require('node:assert/strict');
const { buildDashboardMetrics } = require('../../src/modules/manager/manager.dashboard-metrics');

describe('Manager dashboard metrics and aggregations', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');

  function work(overrides = {}) {
    return {
      _id: overrides._id || Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24),
      ticketId: 'SVC-001', sourceType: 'service', status: 'open', subject: 'Fabricated repair',
      priority: 'medium', createdAt: '2026-08-29T10:00:00.000Z', updatedAt: '2026-08-29T11:00:00.000Z',
      ...overrides,
    };
  }

  function build(overrides = {}) {
    return buildDashboardMetrics({
      tickets: [], orders: [], inventory: [], materialRequests: [], authorizations: [],
      serviceRating30d: { average: null, responseCount: 0 }, now, ...overrides,
    });
  }

  it('reconciles open totals and excludes terminal and inspection records from unassigned and SLA risk', () => {
    const data = build({ tickets: [
      work({ _id: '111111111111111111111111', status: 'open' }),
      work({ _id: '222222222222222222222222', status: 'in-progress' }),
      work({ _id: '333333333333333333333333', status: 'escalated' }),
      work({ _id: '444444444444444444444444', status: 'cancelled', slaDueAt: '2026-08-29T00:00:00.000Z' }),
      work({ _id: '555555555555555555555555', sourceType: 'inspection', status: 'open' }),
    ] });
    assert.equal(data.stats.openTickets.total, 4);
    assert.equal(data.stats.openTickets.subStats.reduce((sum, row) => sum + row.value, 0), 4);
    assert.equal(data.stats.unassignedTickets.total, 3);
    assert.equal(data.stats.slaRisk.total, 0);
  });

  it('normalizes purchase status and combines approval values, urgency, and oldest age', () => {
    const data = build({
      orders: [{
        _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', requestId: 'PR-1', status: 'pending-approval', priority: 'urgent',
        totalEstimate: 1200, supplierName: 'Fabricated Supplier', createdAt: '2026-08-29T12:00:00.000Z',
      }],
      authorizations: [{
        _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', authorizationNumber: 'NPO-1', status: 'pending',
        nonPoReason: 'EMERGENCY_REPAIR', estimatedTotal: 300, supplierName: 'Local Supplier',
        createdAt: '2026-08-30T06:00:00.000Z',
      }],
    });
    assert.equal(data.stats.pendingApprovals.total, 2);
    assert.equal(data.stats.pendingApprovals.totalValue, 1500);
    assert.equal(data.stats.pendingApprovals.urgent, 2);
    assert.equal(data.stats.pendingApprovals.oldestPendingAgeHours, 24);
  });

  it('deduplicates action reasons, ranks by deadline, and sorts all updates before slicing', () => {
    const risky = work({
      _id: 'cccccccccccccccccccccccc', status: 'escalated', priority: 'high',
      slaDueAt: '2026-08-30T11:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z',
    });
    const tickets = [risky];
    for (let index = 0; index < 9; index += 1) tickets.push(work({
      _id: `${index + 1}`.repeat(24).slice(0, 24), assignedTechnicianId: { _id: `tech-${index}`, fullName: `Tech ${index}` },
      updatedAt: new Date(now.getTime() - index * 60000),
    }));
    const data = build({ tickets });
    const action = data.pendingActions.find((item) => item.sourceId === risky._id);
    assert.deepEqual(action.reasons, ['Escalated', 'SLA overdue', 'Awaiting Main Technician assignment']);
    assert.equal(data.pendingActionsTotal, 1);
    assert.equal(data.recentActivity.length, 8);
    assert.equal(data.recentActivity[0].sourceId, tickets[1]._id);
  });

  it('workload uses stable identity and preview ordering by SLA risk then active', () => {
    const data = build({ tickets: [
      work({ _id: '111111111111111111111111', assignedTechnicianId: { _id: 'tech-1', fullName: 'Same Name' }, slaDueAt: '2026-08-30T13:00:00.000Z' }),
      work({ _id: '222222222222222222222222', sourceType: 'installation', assignedTeamId: 'team-1', assignedTeamName: 'Same Name', assignedTo: 'Same Name' }),
    ] });
    assert.equal(data.workloadPreview.length, 2);
    assert.notEqual(data.workloadPreview[0].assigneeId, data.workloadPreview[1].assigneeId);
    assert.equal(data.workloadPreview[0].slaRisk, 1);
  });
});
