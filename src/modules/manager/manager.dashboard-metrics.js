'use strict';

const { isLowStock } = require('../../utils/inventory-domain');

const TERMINAL_STATUSES = ['resolved', 'cancelled', 'closed'];

function priorityRank(priority) {
  return { high: 3, medium: 2, low: 1 }[String(priority).toLowerCase()] || 0;
}

function isTerminal(status) {
  return TERMINAL_STATUSES.includes(String(status).toLowerCase());
}

function isUnassigned(ticket) {
  return !ticket.assignedTechnicianId
    && !ticket.assignedTo
    && !ticket.assignedTeamId
    && !ticket.assignedTeamName;
}

function ticketRoute(status) {
  return { route: '/manager/work-items', queryParams: status ? { status } : {} };
}

function buildDashboardMetrics({
  tickets = [],
  orders = [],
  inventory = [],
  materialRequests = [],
  authorizations = [],
  serviceRating30d = { average: null, responseCount: 0 },
  now = new Date(),
  user = null,
} = {}) {
  const currentDate = new Date(now);
  const nearDue = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);

  // Active (non-terminal) tickets
  const activeTickets = tickets.filter((ticket) => !isTerminal(ticket.status));

  // Active non-inspection tickets
  const activeNonInspectionTickets = activeTickets.filter((ticket) => ticket.sourceType !== 'inspection');

  // Unassigned: active non-inspection tickets with no technician/team assigned
  const unassigned = activeNonInspectionTickets.filter(isUnassigned);

  // SLA risk: non-terminal and non-inspection tickets with SLA overdue or due in 24h
  const overdue = activeNonInspectionTickets.filter((ticket) => (
    ticket.slaDueAt && new Date(ticket.slaDueAt) <= currentDate
  ));
  const dueSoon = activeNonInspectionTickets.filter((ticket) => {
    if (!ticket.slaDueAt) return false;
    const due = new Date(ticket.slaDueAt);
    return due > currentDate && due <= nearDue;
  });

  // Approvals: orders and non-po authorizations
  const pendingOrders = orders.filter((order) => (
    ['pending-manager', 'pending-approval', 'pending'].includes(String(order.status).toLowerCase())
  ));
  const pendingAuthorizations = authorizations.filter((auth) => (
    ['pending', 'pending-approval', 'pending-manager'].includes(String(auth.status).toLowerCase())
  ));

  const pendingApprovalsTotal = pendingOrders.length + pendingAuthorizations.length;

  const ordersValue = pendingOrders.reduce((sum, o) => sum + Number(o.totalEstimate || o.totalAmount || 0), 0);
  const authsValue = pendingAuthorizations.reduce((sum, a) => sum + Number(a.estimatedTotal || a.totalAmount || 0), 0);
  const pendingTotalValue = ordersValue + authsValue;

  const urgentOrders = pendingOrders.filter((o) => o.priority === 'urgent').length;
  const urgentAuths = pendingAuthorizations.filter((a) => (
    a.priority === 'urgent' || a.nonPoReason === 'EMERGENCY_REPAIR'
  )).length;
  const urgentApprovals = urgentOrders + urgentAuths;

  const allPendingCreated = [
    ...pendingOrders.map((o) => o.createdAt),
    ...pendingAuthorizations.map((a) => a.createdAt),
  ].filter(Boolean).map((d) => new Date(d).getTime());

  const oldestPendingAgeHours = allPendingCreated.length > 0
    ? Math.max(0, Math.round((currentDate.getTime() - Math.min(...allPendingCreated)) / (3600 * 1000)))
    : 0;

  // Inventory calculations
  const lowStock = inventory.filter(isLowStock);
  const reservedItems = inventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
  const inventoryById = new Map(inventory.map((item) => [String(item._id), item]));
  const blockedMaterialRequests = materialRequests.filter((request) => (
    (request.items || []).some((line) => (
      Number(inventoryById.get(String(line.inventoryId))?.available || 0) < Number(line.qty || 0)
    ))
  ));
  const shortageOrderByMaterialRequest = new Map(orders
    .filter((order) => order.source === 'material-request' && order.sourceMaterialRequestId)
    .map((order) => [String(order.sourceMaterialRequestId), order]));

  // Open tickets subStats
  const openCount = activeTickets.filter((t) => t.status === 'open').length;
  const inProgressCount = activeTickets.filter((t) => t.status === 'in-progress').length;
  const escalatedCount = activeTickets.filter((t) => t.status === 'escalated').length;
  const otherActiveCount = activeTickets.length - openCount - inProgressCount - escalatedCount;

  const openTicketSubStats = [
    { label: 'Open', value: openCount },
    { label: 'In Progress', value: inProgressCount },
    { label: 'Escalated', value: escalatedCount },
  ];
  if (otherActiveCount > 0) {
    openTicketSubStats.push({ label: 'Other', value: otherActiveCount });
  }

  const stats = {
    openTickets: {
      total: activeTickets.length,
      subStats: openTicketSubStats,
    },
    unassignedTickets: {
      total: unassigned.length,
      subStats: [
        { label: 'High Priority', value: unassigned.filter((t) => t.priority === 'high').length },
        { label: 'Other', value: unassigned.filter((t) => t.priority !== 'high').length },
      ],
    },
    slaRisk: {
      total: overdue.length + dueSoon.length,
      subStats: [
        { label: 'Overdue', value: overdue.length },
        { label: 'Due in 24h', value: dueSoon.length },
      ],
    },
    pendingApprovals: {
      total: pendingApprovalsTotal,
      totalValue: pendingTotalValue,
      urgent: urgentApprovals,
      oldestPendingAgeHours,
      subStats: [
        { label: 'Urgent', value: urgentApprovals },
        { label: 'Value', value: pendingTotalValue },
        { label: 'Non-PO', value: pendingAuthorizations.length },
      ],
    },
  };

  // Build deduplicated pending actions
  const pendingActionsMap = new Map();

  for (const ticket of activeTickets) {
    const reasons = [];
    if (ticket.status === 'escalated') {
      reasons.push('Escalated');
    }
    if (ticket.slaDueAt && new Date(ticket.slaDueAt) <= currentDate) {
      reasons.push('SLA overdue');
    } else if (ticket.slaDueAt && new Date(ticket.slaDueAt) <= nearDue) {
      reasons.push('SLA due soon');
    }
    if (isUnassigned(ticket) && ticket.sourceType !== 'inspection') {
      reasons.push('Awaiting Main Technician assignment');
    }

    if (reasons.length > 0) {
      pendingActionsMap.set(String(ticket._id), {
        id: `ticket-action-${ticket._id}`,
        sourceId: ticket._id,
        type: ticket.status === 'escalated' ? 'escalation' : (ticket.slaDueAt ? 'sla' : 'ticket'),
        title: `${reasons[0]}: ${ticket.ticketId || 'Ticket'}`,
        description: ticket.subject || 'Work item requiring attention',
        priority: (ticket.priority === 'high' || reasons.includes('Escalated') || reasons.includes('SLA overdue'))
          ? 'high' : 'medium',
        reasons,
        createdAt: ticket.slaDueAt || ticket.updatedAt || ticket.createdAt,
        deadline: ticket.slaDueAt ? new Date(ticket.slaDueAt).getTime() : Infinity,
        ...ticketRoute(ticket.status),
      });
    }
  }

  for (const order of pendingOrders) {
    pendingActionsMap.set(`order-${order._id}`, {
      id: `order-${order._id}`,
      sourceId: order._id,
      type: 'order',
      title: `Review ${order.requestId}`,
      description: `${order.supplierName || 'Supplier'} purchase request`,
      priority: order.priority === 'urgent' ? 'high' : 'medium',
      reasons: ['Pending Manager Approval'],
      createdAt: order.createdAt,
      deadline: Infinity,
      route: '/manager/orders',
      queryParams: { status: 'pending-manager' },
    });
  }

  for (const auth of pendingAuthorizations) {
    pendingActionsMap.set(`auth-${auth._id}`, {
      id: `auth-${auth._id}`,
      sourceId: auth._id,
      type: 'authorization',
      title: `Review ${auth.authorizationNumber}`,
      description: `${String(auth.nonPoReason || 'NON_PO').replaceAll('_', ' ')} · ${auth.supplierName || 'Supplier not specified'}`,
      priority: auth.nonPoReason === 'EMERGENCY_REPAIR' ? 'high' : 'medium',
      reasons: ['Pending Non-PO Approval'],
      createdAt: auth.createdAt,
      deadline: Infinity,
      route: '/manager/orders',
      queryParams: { type: 'non-po', status: 'pending' },
    });
  }

  for (const request of blockedMaterialRequests) {
    const linkedOrder = shortageOrderByMaterialRequest.get(String(request.sourceMaterialRequestId));
    pendingActionsMap.set(`shortage-${request._id}`, {
      id: `material-shortage-${request._id}`,
      sourceId: request._id,
      type: 'inventory',
      title: `Material shortage: ${request.requestId}`,
      description: linkedOrder
        ? `${linkedOrder.requestId} · ${linkedOrder.supplierName}`
        : `${request.requester || 'Requester'} · ${request.location || 'Location'}`,
      priority: 'high',
      reasons: ['Material Shortage'],
      createdAt: request.createdAt,
      deadline: Infinity,
      route: linkedOrder ? '/manager/orders' : '/manager/analytics/inventory-exception-control',
      queryParams: linkedOrder
        ? { type: 'purchase', status: linkedOrder.status }
        : { materialRequest: request.requestId },
    });
  }

  const allPendingActions = Array.from(pendingActionsMap.values()).sort((a, b) => (
    a.deadline - b.deadline
    || priorityRank(b.priority) - priorityRank(a.priority)
    || new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  ));

  const pendingActionsTotal = allPendingActions.length;
  const pendingActions = allPendingActions.slice(0, 12);

  // Recent activity: tickets + orders sorted descending by timestamp, sliced to 8
  const ticketActivity = tickets.map((ticket) => ({
    id: String(ticket._id),
    sourceId: ticket._id,
    type: ticket.status === 'escalated' ? 'escalation' : 'ticket',
    title: `${ticket.status === 'resolved' ? 'Resolved' : 'Updated'} ${ticket.ticketId || 'Ticket'}`,
    description: ticket.subject,
    timestamp: ticket.updatedAt || ticket.createdAt,
    ...ticketRoute(ticket.status),
  }));

  const orderActivity = orders.map((order) => ({
    id: String(order._id),
    sourceId: order._id,
    type: 'order',
    title: `${order.requestId || 'Order'} is ${String(order.status).replace('-', ' ')}`,
    description: `${order.supplierName || 'Supplier'} · ${Number(order.totalEstimate || 0).toLocaleString()}`,
    timestamp: order.updatedAt || order.createdAt,
    route: '/manager/orders',
    queryParams: { status: order.status },
  }));

  const recentActivity = [...ticketActivity, ...orderActivity]
    .filter((item) => item.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);

  // Workload Preview by stable assignee identity
  const workloadMap = new Map();

  for (const ticket of activeTickets) {
    let assigneeId = null;
    let assigneeName = null;
    let assigneeType = 'technician';

    if (ticket.assignedTechnicianId) {
      assigneeId = String(ticket.assignedTechnicianId._id || ticket.assignedTechnicianId);
      assigneeName = ticket.assignedTechnicianId.fullName || ticket.assignedTechnicianName || ticket.assignedTo || 'Technician';
      assigneeType = 'technician';
    } else if (ticket.assignedTeamId) {
      assigneeId = String(ticket.assignedTeamId._id || ticket.assignedTeamId);
      assigneeName = ticket.assignedTeamName || ticket.assignedTo || 'Team';
      assigneeType = 'team';
    } else if (ticket.assignedTo) {
      assigneeId = String(ticket.assignedTo);
      assigneeName = String(ticket.assignedTo);
      assigneeType = 'technician';
    }

    if (assigneeId) {
      const key = `${assigneeType}:${assigneeId}`;
      if (!workloadMap.has(key)) {
        workloadMap.set(key, {
          assigneeId,
          assigneeName,
          assigneeType,
          active: 0,
          slaRisk: 0,
        });
      }
      const entry = workloadMap.get(key);
      entry.active += 1;
      if (ticket.slaDueAt && new Date(ticket.slaDueAt) <= nearDue) {
        entry.slaRisk += 1;
      }
    }
  }

  const workloadPreview = Array.from(workloadMap.values()).sort((a, b) => (
    b.slaRisk - a.slaRisk
    || b.active - a.active
    || a.assigneeName.localeCompare(b.assigneeName)
  ));

  return {
    managerName: user?.fullName || 'Manager',
    currentDate,
    status: 'Operational',
    stats,
    inventoryKpis: {
      reservedItems: { label: 'Reserved Items', value: reservedItems, icon: 'clipboard-check' },
      lowStockAlerts: { label: 'Low Stock Alerts', value: lowStock.length, icon: 'triangle-alert' },
      pendingMaterialRequests: { label: 'Pending Material Requests', value: materialRequests.length, icon: 'package-clock' },
      blockedMaterialRequests: { label: 'Blocked Material Requests', value: blockedMaterialRequests.length, icon: 'triangle-alert' },
    },
    pendingActions,
    pendingActionsTotal,
    recentActivity,
    workloadPreview,
  };
}

module.exports = {
  buildDashboardMetrics,
  priorityRank,
  isTerminal,
  isUnassigned,
};
