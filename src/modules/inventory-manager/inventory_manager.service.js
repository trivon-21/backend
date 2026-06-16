const Inventory = require('../../models/Inventory');
const Activity = require('../../models/Activity');
const Logistics = require('../../models/Logistics');
const Supplier = require('../../models/Supplier');
const Procurement = require('../../models/Procurement');
const Order = require('../../models/Order');
const MaterialRequest = require('../../models/MaterialRequest');
const AssetLoan = require('../../models/AssetLoan');
const AssetReturnLog = require('../../models/AssetReturnLog');
const OrderRequest = require('../../models/OrderRequest');
const LeftoverReturn = require('../../models/LeftoverReturn');
const RmaCase = require('../../models/RmaCase');
const QuarantineItem = require('../../models/QuarantineItem');
const mongoose = require('mongoose');

/**
 * Retrieves aggregated dashboard data including inventory stats, recent activity, and logistics status.
 */
exports.getDashboardData = async (user) => {
  const inventory = await Inventory.find();
  const activities = await Activity.find({ 
    type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] } 
  }).sort({ timestamp: -1 }).limit(10);
  const logistics = await Logistics.find();

  const orders = await Order.find();
  const loans = await AssetLoan.find();
  const materialRequests = await MaterialRequest.find();

  // Aggregate stats for dashboard tiles
  const pendingRequestsCount = materialRequests.filter(r => r.status === 'pending').length;
  const reservedRequestsCount = materialRequests.filter(r => r.status === 'reserved').length;

  const stats = {
    materialReservations: {
      total: pendingRequestsCount + reservedRequestsCount,
      subStats: [
        { label: 'Pending Requests', value: pendingRequestsCount },
        { label: 'Reserved/Kitted', value: reservedRequestsCount }
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
        { label: 'Overdue Returns', value: loans.filter(l => new Date(l.dueDate) < new Date() && !l.returnDate).length }
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

/**
 * Fetches all inventory items sorted by name.
 */
exports.getInventoryList = async () => {
  return await Inventory.find().sort({ name: 1 });
};

/**
 * Retrieves a single inventory item by its ID.
 */
exports.getInventoryItem = async (id) => {
  return await Inventory.findById(id);
};

/**
 * Updates an existing inventory item.
 */
exports.updateInventoryItem = async (id, data) => {
  return await Inventory.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Creates a new inventory item and calculates its initial stock status.
 * Automatically generates a GRN (Goods Received Note) and activity log if supplier info is provided.
 */
exports.createInventoryItem = async (data, user) => {
  const available = Number(data.available) || 0;
  const reorderLevel = Number(data.reorderLevel) || 10;
  
  // Calculate stock status based on thresholds
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

  // Create procurement record for incoming stock
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

    // Log the Goods Received activity
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

/**
 * Fetches the most recent procurement records.
 */
exports.getRecentProcurements = async () => {
  return await Procurement.find().sort({ timestamp: -1 }).limit(10);
};

/**
 * Retrieves a list of all registered suppliers.
 */
exports.getSuppliersList = async () => {
  return await Supplier.find().sort({ name: 1 });
};

/**
 * Registers a new supplier in the system.
 */
exports.createSupplier = async (name) => {
  const newSupplier = new Supplier({ name });
  return await newSupplier.save();
};

/**
 * Retrieves all orders sorted by creation date.
 */
exports.getOrders = async () => {
  return await Order.find().sort({ createdAt: -1 });
};

/**
 * Updates an order's details and manages status-related timestamps.
 */
exports.updateOrder = async (id, data) => {
  if (data.lastMovedAt === null) {
    const { lastMovedAt, completedAt, ...restData } = data;
    return await Order.findOneAndUpdate({ orderId: id }, { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: restData }, { new: true });
  }
  return await Order.findOneAndUpdate({ orderId: id }, data, { new: true });
};

/**
 * Fetches all material requests sorted by creation date.
 */
exports.getMaterialRequests = async () => {
  return await MaterialRequest.find().sort({ createdAt: -1 });
};

/**
 * Updates a material request and handles state transition resets.
 */
exports.updateMaterialRequest = async (id, data) => {
  if (data.lastMovedAt === null) {
    const { lastMovedAt, completedAt, ...restData } = data;
    return await MaterialRequest.findOneAndUpdate({ requestId: id }, { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: restData }, { new: true });
  }
  return await MaterialRequest.findOneAndUpdate({ requestId: id }, data, { new: true });
};

/**
 * Retrieves technician members from the primary Dassana database.
 */
exports.getTechnicians = async () => {
  const dassanaDb = mongoose.connection.useDb('Dassana');
  return await dassanaDb.collection('TechTeamMembers').find({}).toArray();
};

/**
 * Fetches all active asset loans.
 */
exports.getAssetLoans = async () => {
  return await AssetLoan.find().sort({ checkedOutAt: -1 });
};

/**
 * Records a new tool checkout and logs the activity.
 */
exports.checkOutTool = async (data) => {
  const newLoan = new AssetLoan(data);
  const savedLoan = await newLoan.save();

  const activity = new Activity({
    type: 'request',
    title: 'Tool Checked Out',
    description: `${data.technicianName} checked out ${data.toolName} (${data.assetTag})`,
    actionLabel: 'View Asset'
  });
  await activity.save();

  return savedLoan;
};

/**
 * Processes a tool return, archiving the loan and logging the return event.
 */
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

  const activity = new Activity({
    type: 'return',
    title: 'Tool Returned',
    description: `${loan.technicianName} returned ${loan.toolName} (${loan.assetTag})`,
    actionLabel: 'View Log'
  });
  await activity.save();

  return await AssetLoan.findByIdAndDelete(loanId);
};

/**
 * Retrieves all historical asset return logs.
 */
exports.getAssetReturnLogs = async () => {
  return await AssetReturnLog.find().sort({ returnedAt: -1 });
};

// ── Order Creation Methods ──

/**
 * Fetches all purchase order requests.
 */
exports.getOrderRequests = async () => {
  return await OrderRequest.find().sort({ createdAt: -1 });
};

/**
 * Creates a new purchase order request with auto-generated ID and total estimates.
 */
exports.createOrderRequest = async (data, user) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const requestId = `ORD-${year}${month}${day}-${hours}${minutes}${seconds}`;

  const items = (data.items || []).map(item => ({
    ...item,
    estimatedTotal: (item.quantity || 0) * (item.unitCost || 0)
  }));
  const totalEstimate = items.reduce((sum, item) => sum + item.estimatedTotal, 0);

  const newRequest = new OrderRequest({
    requestId,
    items,
    supplierName: data.supplierName,
    totalEstimate,
    status: data.status || 'draft',
    requestedBy: user?.fullName || 'Inventory Manager',
    priority: data.priority || 'normal',
    notes: data.notes || '',
    source: data.source || 'manual'
  });

  const saved = await newRequest.save();

  const activity = new Activity({
    type: 'request',
    title: 'Order Request Created',
    description: `New purchase order ${requestId} submitted for ${data.supplierName} (${items.length} items)`,
    actionLabel: 'View Order'
  });
  await activity.save();

  return saved;
};

/**
 * Updates an existing purchase order request.
 */
exports.updateOrderRequest = async (id, data) => {
  const request = await OrderRequest.findOne({ requestId: id });
  if (!request) throw new Error('Order request not found');

  if (data.items) {
    data.items = data.items.map(item => ({
      ...item,
      estimatedTotal: (item.quantity || 0) * (item.unitCost || 0)
    }));
    data.totalEstimate = data.items.reduce((sum, item) => sum + item.estimatedTotal, 0);
  }

  return await OrderRequest.findOneAndUpdate(
    { requestId: id },
    { $set: data },
    { new: true }
  );
};

/**
 * Approves a purchase order request and auto-generates procurement records.
 */
exports.approveOrderRequest = async (id, user) => {
  const request = await OrderRequest.findOne({ requestId: id });
  if (!request) throw new Error('Order request not found');

  request.status = 'approved';
  request.approvedBy = user?.fullName || 'Finance Officer';
  request.approvedAt = new Date();
  await request.save();

  for (const item of request.items) {
    const procurement = new Procurement({
      invoiceNumber: `AWAITING-${request.requestId}`,
      poNumber: request.requestId,
      supplierName: request.supplierName,
      itemName: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unit: 'units',
      receivedBy: request.approvedBy
    });
    await procurement.save();
  }

  const activity = new Activity({
    type: 'grn',
    title: 'Order Approved',
    description: `Purchase order ${request.requestId} approved by ${request.approvedBy}.`,
    actionLabel: 'View Procurement'
  });
  await activity.save();

  return request;
};

/**
 * Rejects a purchase order request with a specified reason.
 */
exports.rejectOrderRequest = async (id, reason, user) => {
  const request = await OrderRequest.findOne({ requestId: id });
  if (!request) throw new Error('Order request not found');

  request.status = 'rejected';
  request.rejectionReason = reason || 'No reason provided';
  request.rejectedAt = new Date();
  await request.save();

  const activity = new Activity({
    type: 'alert',
    title: 'Order Rejected',
    description: `Purchase order ${request.requestId} was rejected.`,
    actionLabel: 'View Order'
  });
  await activity.save();

  return request;
};

/**
 * Retrieves items that require restocking based on their low-stock status.
 */
exports.getSuggestedOrders = async () => {
  return await Inventory.find({ status: { $in: ['warning', 'critical'] } })
    .sort({ available: 1 })
    .select('name sku available reserved reorderLevel unitCost unit status category brand');
};

/**
 * Retrieves the global activity log for inventory and logistics events.
 */
exports.getActivityLog = async () => {
  return await Activity.find({ 
    type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] } 
  }).sort({ timestamp: -1 });
};

// ── Returns & RMA Methods ──

/**
 * Generates a unique ID with the given prefix and current timestamp.
 */
function generateId(prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Fetches all leftover returns sorted by most recent first.
 */
exports.getLeftoverReturns = async () => {
  return await LeftoverReturn.find().sort({ createdAt: -1 });
};

/**
 * Creates a new leftover return record.
 * - If condition is 'good': restores quantity to inventory stock.
 * - If condition is 'damaged' or 'scrap': creates a quarantine item.
 * Logs an activity for the return.
 */
exports.createLeftoverReturn = async (data, user) => {
  const returnId = generateId('LR');
  const returnedBy = user?.fullName || 'Inventory Manager';

  const leftoverReturn = new LeftoverReturn({
    returnId,
    jobId: data.jobId,
    itemId: data.itemId || null,
    itemName: data.itemName,
    itemSku: data.itemSku || '',
    quantityReturned: data.quantityReturned,
    condition: data.condition,
    returnedBy,
    notes: data.notes || '',
    restoredToStock: false,
    movedToQuarantine: false,
  });

  // Business logic: update stock or quarantine based on condition
  if (data.condition === 'good') {
    // Restore to inventory
    if (data.itemId) {
      const item = await Inventory.findById(data.itemId);
      if (item) {
        item.available = (item.available || 0) + data.quantityReturned;
        // Recalculate stock status
        if (item.available === 0) {
          item.status = 'critical';
        } else if (item.available <= (item.reorderLevel || 10)) {
          item.status = 'warning';
        } else {
          item.status = 'normal';
        }
        await item.save();
      }
    }
    leftoverReturn.restoredToStock = true;
  } else {
    // Damaged or scrap → move to quarantine
    const quarantineId = generateId('QZ');
    const quarantineItem = new QuarantineItem({
      quarantineId,
      itemName: data.itemName,
      quantity: data.quantityReturned,
      unit: data.unit || 'units',
      reason: data.condition === 'scrap'
        ? `Scrap from job ${data.jobId}: ${data.notes || 'No details'}`
        : `Damaged from job ${data.jobId}: ${data.notes || 'No details'}`,
      location: data.location || '',
      source: 'leftover-return',
      sourceRefId: returnId,
    });
    await quarantineItem.save();
    leftoverReturn.movedToQuarantine = true;
  }

  const saved = await leftoverReturn.save();

  // Log activity
  const activity = new Activity({
    type: 'return',
    title: 'Leftover Material Returned',
    description: `${data.quantityReturned} ${data.unit || 'units'} of ${data.itemName} returned from job ${data.jobId} (${data.condition})`,
    actionLabel: 'View Returns',
  });
  await activity.save();

  return saved;
};

/**
 * Fetches all RMA cases sorted by most recent first.
 */
exports.getRmaCases = async () => {
  return await RmaCase.find().sort({ createdAt: -1 });
};

/**
 * Creates a new RMA case and logs the activity.
 */
exports.createRmaCase = async (data, user) => {
  const rmaId = generateId('RMA');
  const reportedBy = user?.fullName || 'Inventory Manager';

  const rmaCase = new RmaCase({
    rmaId,
    serialNumber: data.serialNumber,
    itemName: data.itemName || '',
    itemSku: data.itemSku || '',
    faultDescription: data.faultDescription,
    reportedBy,
    status: 'reported',
    type: data.type || 'Single',
    resolution: '',
  });

  const saved = await rmaCase.save();

  const activity = new Activity({
    type: 'return',
    title: 'RMA Case Created',
    description: `RMA ${rmaId} filed for ${data.serialNumber}: ${data.faultDescription}`,
    actionLabel: 'View RMA',
  });
  await activity.save();

  return saved;
};

/**
 * Updates an RMA case status with transition validation.
 * Valid transitions: reported → under-review → sent-to-supplier → resolved → closed
 */
exports.updateRmaCase = async (id, data) => {
  const rmaCase = await RmaCase.findOne({ rmaId: id });
  if (!rmaCase) throw new Error('RMA case not found');

  const validTransitions = {
    'reported': ['under-review'],
    'under-review': ['sent-to-supplier', 'resolved'],
    'sent-to-supplier': ['resolved'],
    'resolved': ['closed'],
    'closed': [],
  };

  if (data.status && data.status !== rmaCase.status) {
    const allowed = validTransitions[rmaCase.status] || [];
    if (!allowed.includes(data.status)) {
      throw new Error(`Invalid status transition from '${rmaCase.status}' to '${data.status}'`);
    }

    rmaCase.status = data.status;

    if (data.status === 'resolved' || data.status === 'closed') {
      rmaCase.resolvedAt = rmaCase.resolvedAt || new Date();
    }
  }

  if (data.resolution !== undefined) {
    rmaCase.resolution = data.resolution;
  }

  const saved = await rmaCase.save();

  const activity = new Activity({
    type: 'return',
    title: 'RMA Status Updated',
    description: `RMA ${rmaCase.rmaId} status changed to ${rmaCase.status}`,
    actionLabel: 'View RMA',
  });
  await activity.save();

  return saved;
};

/**
 * Fetches all active quarantine items (status = 'quarantined').
 */
exports.getQuarantineItems = async () => {
  return await QuarantineItem.find({ status: 'quarantined' }).sort({ createdAt: -1 });
};

/**
 * Manually adds an item to the quarantine zone.
 */
exports.createQuarantineItem = async (data, user) => {
  const quarantineId = generateId('QZ');

  const quarantineItem = new QuarantineItem({
    quarantineId,
    itemName: data.itemName,
    quantity: data.quantity,
    unit: data.unit || 'units',
    reason: data.reason,
    location: data.location || '',
    source: 'manual',
    sourceRefId: '',
  });

  const saved = await quarantineItem.save();

  const activity = new Activity({
    type: 'alert',
    title: 'Item Quarantined',
    description: `${data.quantity} ${data.unit || 'units'} of ${data.itemName} added to quarantine: ${data.reason}`,
    actionLabel: 'View Quarantine',
  });
  await activity.save();

  return saved;
};

/**
 * Disposes a quarantine item — updates status and records audit trail.
 */
exports.disposeQuarantineItem = async (id, user) => {
  const item = await QuarantineItem.findOne({ quarantineId: id });
  if (!item) throw new Error('Quarantine item not found');
  if (item.status !== 'quarantined') throw new Error('Item is already disposed');

  item.status = 'disposed';
  item.disposedAt = new Date();
  item.disposedBy = user?.fullName || 'Inventory Manager';

  const saved = await item.save();

  const activity = new Activity({
    type: 'alert',
    title: 'Quarantine Item Disposed',
    description: `${item.quantity} ${item.unit} of ${item.itemName} disposed from quarantine`,
    actionLabel: 'View Quarantine',
  });
  await activity.save();

  return saved;
};

/**
 * Aggregates summary stats for the returns page header.
 */
exports.getReturnsSummary = async () => {
  const totalReturns = await LeftoverReturn.countDocuments();
  const restoredToStock = await LeftoverReturn.countDocuments({ restoredToStock: true });
  const movedToQuarantine = await LeftoverReturn.countDocuments({ movedToQuarantine: true });

  const activeRmaCases = await RmaCase.countDocuments({ status: { $nin: ['closed'] } });
  const totalRmaCases = await RmaCase.countDocuments();

  const quarantineCount = await QuarantineItem.countDocuments({ status: 'quarantined' });
  const disposedCount = await QuarantineItem.countDocuments({ status: 'disposed' });

  return {
    leftoverReturns: {
      total: totalReturns,
      restoredToStock,
      movedToQuarantine,
    },
    rmaCases: {
      total: totalRmaCases,
      active: activeRmaCases,
    },
    quarantine: {
      active: quarantineCount,
      disposed: disposedCount,
    },
  };
};
