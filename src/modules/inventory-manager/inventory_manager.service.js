const Inventory = require('../../models/Inventory');
const Activity = require('../../models/Activity');
const Logistics = require('../../models/Logistics');
const Supplier = require('../../models/Supplier');
const Procurement = require('../../models/Procurement');
const Order = require('../../models/Order');
const MaterialRequest = require('../../models/MaterialRequest');
const AssetLoan = require('../../models/AssetLoan');
const AssetReturnLog = require('../../models/AssetReturnLog');
const mongoose = require('mongoose');

exports.getDashboardData = async (user) => {
  const inventory = await Inventory.find();
  const activities = await Activity.find().sort({ timestamp: -1 }).limit(10);
  const logistics = await Logistics.find();

  const orders = await Order.find();
  const loans = await AssetLoan.find();

  // Calculate Stats
  const materialReservationsTotal = inventory
    .reduce((acc, curr) => acc + (curr.reserved || 0), 0);

  const stats = {
    materialReservations: {
      total: materialReservationsTotal,
      subStats: [
        { label: 'Installation Kits', value: inventory.filter(i => i.category === 'Installation Kits').reduce((acc, curr) => acc + (curr.reserved || 0), 0) },
        { label: 'Repair Parts', value: inventory.filter(i => i.category === 'Repair Parts').reduce((acc, curr) => acc + (curr.reserved || 0), 0) }
      ]
    },
    dispatchQueue: {
      total: orders.filter(o => o.status === 'to-pack' || o.status === 'ready').length,
      subStats: [
        { label: 'To Pack', value: orders.filter(o => o.status === 'to-pack').length },
        { label: 'Ready for Pickup', value: orders.filter(o => o.status === 'ready').length }
      ]
    },
    assetHealth: {
      total: loans.length,
      subStats: [
        { label: 'Tools in Field', value: loans.length },
        { label: 'Overdue Returns', value: loans.filter(l => new Date(l.dueDate) < new Date()).length }
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
      name: i.name,
      available: i.available,
      reserved: i.reserved,
      status: i.status
    }));

  return {
    managerName: user?.fullName?.split(' ')[0] || 'Manager',
    currentDate: new Date(),
    status: mongoose.connection.readyState === 1 ? 'Operational' : 'Offline',
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

exports.getInventoryItem = async (id) => {
  return await Inventory.findById(id);
};

exports.updateInventoryItem = async (id, data) => {
  return await Inventory.findByIdAndUpdate(id, data, { new: true });
};

exports.createInventoryItem = async (data, user) => {
  // Calculate status based on availability and reorder level
  const available = Number(data.available) || 0;
  const reorderLevel = Number(data.reorderLevel) || 10;
  
  let status = 'normal';
  if (available === 0) {
    status = 'critical';
  } else if (available <= reorderLevel) {
    status = 'warning';
  }

  const newItem = new Inventory({
    ...data,
    status
  });

  const savedItem = await newItem.save();

  // Log as Procurement/GRN
  if (data.supplierName && data.invoiceNumber) {
    const procurement = new Procurement({
      invoiceNumber: data.invoiceNumber,
      supplierName: data.supplierName,
      itemName: data.name,
      sku: data.sku,
      quantity: available,
      unit: data.unit || 'units',
      receivedBy: user ? user.fullName : 'Inventory Manager'
    });
    await procurement.save();

    // Log Activity
    const activity = new Activity({
      type: 'grn',
      title: 'Goods Received',
      description: `Received ${available} ${data.unit || 'units'} of ${data.name} from ${data.supplierName}`,
      actionLabel: 'View GRN'
    });
    await activity.save();
  }

  return savedItem;
};

exports.getRecentProcurements = async () => {
  return await Procurement.find().sort({ timestamp: -1 }).limit(10);
};

exports.getSuppliersList = async () => {
  return await Supplier.find().sort({ name: 1 });
};

exports.createSupplier = async (name) => {
  const newSupplier = new Supplier({ name });
  return await newSupplier.save();
};

exports.getOrders = async () => {
  return await Order.find().sort({ createdAt: -1 });
};

exports.updateOrder = async (id, data) => {
  if (data.lastMovedAt === null) {
    const { lastMovedAt, completedAt, ...restData } = data;
    return await Order.findOneAndUpdate({ orderId: id }, { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: restData }, { new: true });
  }
  return await Order.findOneAndUpdate({ orderId: id }, data, { new: true });
};

exports.getMaterialRequests = async () => {
  return await MaterialRequest.find().sort({ createdAt: -1 });
};

exports.updateMaterialRequest = async (id, data) => {
  if (data.lastMovedAt === null) {
    const { lastMovedAt, completedAt, ...restData } = data;
    return await MaterialRequest.findOneAndUpdate({ requestId: id }, { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: restData }, { new: true });
  }
  return await MaterialRequest.findOneAndUpdate({ requestId: id }, data, { new: true });
};

exports.getTechnicians = async () => {
  const dassanaDb = mongoose.connection.useDb('Dassana');
  return await dassanaDb.collection('TechTeamMembers').find({}).toArray();
};

exports.getAssetLoans = async () => {
  return await AssetLoan.find().sort({ checkedOutAt: -1 });
};

exports.checkOutTool = async (data) => {
  const newLoan = new AssetLoan(data);
  const savedLoan = await newLoan.save();

  // Log Activity
  const activity = new Activity({
    type: 'request',
    title: 'Tool Checked Out',
    description: `${data.technicianName} checked out ${data.toolName} (${data.assetTag})`,
    actionLabel: 'View Asset'
  });
  await activity.save();

  return savedLoan;
};

exports.returnTool = async (loanId) => {
  const loan = await AssetLoan.findById(loanId);
  if (!loan) throw new Error('Loan not found');

  const returnLog = new AssetReturnLog({
    toolName: loan.toolName,
    assetTag: loan.assetTag,
    technicianName: loan.technicianName,
    checkedOutAt: loan.checkedOutAt,
    returnedAt: new Date()
  });

  await returnLog.save();

  // Log Activity
  const activity = new Activity({
    type: 'return',
    title: 'Tool Returned',
    description: `${loan.technicianName} returned ${loan.toolName} (${loan.assetTag})`,
    actionLabel: 'View Log'
  });
  await activity.save();

  return await AssetLoan.findByIdAndDelete(loanId);
};

exports.getAssetReturnLogs = async () => {
  return await AssetReturnLog.find().sort({ returnedAt: -1 });
};
