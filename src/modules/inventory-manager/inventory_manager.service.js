const Inventory = require('../../models/Inventory');
const Activity = require('../../models/Activity');
const Logistics = require('../../models/Logistics');

exports.getDashboardData = async (user) => {
  const inventory = await Inventory.find();
  const activities = await Activity.find().sort({ timestamp: -1 }).limit(10);
  const logistics = await Logistics.find();

  // Calculate Stats
  const materialReservationsTotal = inventory
    .filter(i => i.reserved > 0)
    .reduce((acc, curr) => acc + 1, 0); // Count items with reservations

  const stats = {
    materialReservations: {
      total: materialReservationsTotal,
      subStats: [
        { label: 'Installation Kits', value: inventory.filter(i => i.category === 'Installation Kits' && i.reserved > 0).length },
        { label: 'Repair Parts', value: inventory.filter(i => i.category === 'Repair Parts' && i.reserved > 0).length }
      ]
    },
    dispatchQueue: {
      total: 8, // Mock for now as we don't have Orders yet
      subStats: [
        { label: 'Awaiting Partner', value: 3 },
        { label: 'Missing Track ID', value: 5 }
      ]
    },
    assetHealth: {
      total: 112, // Mock for now as we don't have Assets yet
      subStats: [
        { label: 'Tools in Field', value: 110 },
        { label: 'Overdue/Calibrate', value: 2 }
      ]
    },
    stockAlerts: {
      total: inventory.filter(i => i.status !== 'normal').length,
      subStats: [
        { label: 'Below Reorder', value: inventory.filter(i => i.status === 'warning').length },
        { label: 'Out of Stock', value: inventory.filter(i => i.available === 0).length }
      ]
    }
  };

  const reorderList = inventory
    .filter(i => i.status !== 'normal')
    .map(i => ({
      id: i._id,
      itemName: i.name,
      avail: i.available,
      rsvd: i.reserved,
      status: i.status
    }));

  return {
    managerName: user.fullName.split(' ')[0],
    currentDate: new Date(),
    status: 'Operational',
    stats,
    recentActivity: activities.map(a => ({
      id: a._id,
      type: a.type,
      title: a.title,
      description: a.description,
      timestamp: a.timestamp,
      actionLabel: a.actionLabel
    })),
    reorderList,
    logistics: logistics.map(l => ({
      label: l.label,
      current: l.current,
      total: l.total,
      subLabel: l.subLabel
    }))
  };
};

exports.getInventoryList = async () => {
  return await Inventory.find().sort({ name: 1 });
};
