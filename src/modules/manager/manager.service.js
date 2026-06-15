const Inventory = require('../../models/Inventory');
const MaterialRequest = require('../../models/MaterialRequest');
const mongoose = require('mongoose');

/**
 * Aggregates live read-only inventory metrics and marries it with mock metrics for the operational dashboard.
 */
exports.getDashboardData = async (user) => {
  let reservedItemsCount = 0;
  let lowStockAlertsCount = 0;
  let pendingDeliveriesCount = 0;

  try {
    const inventory = await Inventory.find();
    // Sum up the reserved quantity for all inventory items
    reservedItemsCount = inventory.reduce((sum, item) => sum + (item.reserved || 0), 0);
    // Count items with non-normal status (warning or critical)
    lowStockAlertsCount = inventory.filter(item => item.status && item.status !== 'normal').length;

    // Count pending material requests
    const materialRequests = await MaterialRequest.find({ status: 'pending' });
    pendingDeliveriesCount = materialRequests.length;
  } catch (err) {
    console.error('Error fetching inventory data for manager dashboard:', err);
  }

  // Mock stats for manager dashboard
  const stats = {
    pendingTickets: {
      total: 14,
      subStats: [
        { label: 'Unassigned', value: 6 },
        { label: 'Assigned', value: 8 }
      ]
    },
    vehicleAvailability: {
      total: '9/12',
      subStats: [
        { label: 'In Use', value: 9 },
        { label: 'Available', value: 3 }
      ]
    },
    todaysSchedule: {
      total: 18,
      subStats: [
        { label: 'In Progress', value: 5 },
        { label: 'Completed', value: 4 },
        { label: 'Remaining', value: 9 }
      ]
    },
    escalations: {
      total: 2,
      subStats: [
        { label: 'Critical Alert', value: 1 },
        { label: 'SLA Warning', value: 1 }
      ]
    }
  };

  const inventoryKpis = {
    reservedItems: {
      label: 'Reserved Items',
      value: reservedItemsCount,
      icon: 'clipboard-check',
      trend: 'For upcoming jobs'
    },
    lowStockAlerts: {
      label: 'Low Stock Alerts',
      value: lowStockAlertsCount,
      icon: 'triangle-alert',
      trend: lowStockAlertsCount > 0 ? `Affects active jobs` : 'All items normal'
    },
    pendingDeliveries: {
      label: 'Pending Deliveries',
      value: pendingDeliveriesCount,
      icon: 'truck',
      trend: 'To job sites today'
    }
  };

  const recentActivity = [
    {
      id: 'act_m1',
      type: 'escalation',
      title: 'Critical Escalation on Ticket #T-2041',
      description: 'System reported compressor failure after install.',
      timestamp: new Date(Date.now() - 45 * 60 * 1000)
    },
    {
      id: 'act_m2',
      type: 'vehicle',
      title: 'Vehicle Dispatched',
      description: 'Van 5 dispatched to site for ticket #T-2042.',
      timestamp: new Date(Date.now() - 150 * 60 * 1000)
    },
    {
      id: 'act_m3',
      type: 'ticket',
      title: 'Emergency Service Ticket Created',
      description: 'Residential leak reported by customer Jane Smith.',
      timestamp: new Date(Date.now() - 360 * 60 * 1000)
    }
  ];

  const pendingActions = [
    {
      id: 'pa1',
      type: 'vehicle',
      title: 'Assign Vehicle to Ticket #T-2044',
      description: 'Inspection ticket scheduled for tomorrow requires a vehicle assignment.',
      priority: 'high'
    },
    {
      id: 'pa2',
      type: 'escalation',
      title: 'Acknowledge Escalation: Ticket #T-2041',
      description: 'Compressor failure report requires manager acknowledgement.',
      priority: 'high'
    },
    {
      id: 'pa3',
      type: 'order',
      title: 'Review Purchase Request #PR-1022',
      description: 'Awaiting manager approval for parts replenishment.',
      priority: 'medium'
    }
  ];

  return {
    managerName: user?.fullName || 'Manager',
    currentDate: new Date(),
    status: mongoose.connection.readyState === 1 ? 'Operational' : 'Offline',
    stats,
    inventoryKpis,
    recentActivity,
    pendingActions
  };
};
