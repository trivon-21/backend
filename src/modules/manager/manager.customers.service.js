const mongoose = require('mongoose');
const User = require('../../models/User');
const Order = require('../../models/Order');
const InstallationOrder = require('../../models/installationOrder.model');
const ServiceRequest = require('../../models/ServiceRequest');
const Installation = require('../../models/Installation');
const Inquiry = require('../../models/Inquiry');

/**
 * GET /api/manager/customers
 * Lists customer profiles with count of past instances they have worked with AirLux.
 */
exports.getCustomers = async ({
  search = '',
  status = 'all',
  sortBy = 'recent',
  sortOrder = 'desc',
  page = 1,
  limit = 15,
} = {}) => {
  const query = { role: 'CUSTOMER' };

  if (status === 'active') {
    query.isActive = true;
  } else if (status === 'inactive') {
    query.isActive = false;
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s, 'i');
    query.$or = [
      { fullName: regex },
      { lastName: regex },
      { email: regex },
      { phoneNumber: regex },
      { address: regex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const skip = (pageNum - 1) * limitNum;

  // Sorting
  const sort = {};
  if (sortBy === 'name') {
    sort.fullName = sortOrder === 'asc' ? 1 : -1;
  } else {
    sort.createdAt = sortOrder === 'asc' ? 1 : -1;
  }

  const [customers, total, totalCustomersCount, activeCustomersCount] = await Promise.all([
    User.find(query)
      .select('fullName lastName email phoneNumber address gender isActive createdAt updatedAt')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    User.countDocuments(query),
    User.countDocuments({ role: 'CUSTOMER' }),
    User.countDocuments({ role: 'CUSTOMER', isActive: true }),
  ]);

  const customerIdStrings = customers.map((c) => c._id.toString());
  const customerObjectIds = customers.map((c) => c._id);

  // Aggregate past work instances for the customers in the current view
  const [orders, installOrders, serviceRequests, installations, inquiries] = await Promise.all([
    Order.find({
      $or: [
        { userId: { $in: customerIdStrings } },
        { customer: { $in: customerObjectIds } },
      ],
    })
      .select('userId customer createdAt')
      .lean(),
    InstallationOrder.find({
      userId: { $in: customerIdStrings },
    })
      .select('userId createdAt')
      .lean(),
    ServiceRequest.find({
      customerId: { $in: customerObjectIds },
    })
      .select('customerId createdAt')
      .lean(),
    Installation.find({
      customerId: { $in: customerObjectIds },
    })
      .select('customerId serviceDate createdAt')
      .lean(),
    Inquiry.find({
      customer: { $in: customerObjectIds },
    })
      .select('customer createdAt')
      .lean(),
  ]);

  // Instance counts map per customer
  const statsMap = new Map();
  const getStats = (id) => {
    if (!statsMap.has(id)) {
      statsMap.set(id, {
        totalInstances: 0,
        ordersCount: 0,
        servicesCount: 0,
        installationsCount: 0,
        inquiriesCount: 0,
        lastInteractionDate: null,
      });
    }
    return statsMap.get(id);
  };

  const recordInstance = (id, date, type) => {
    if (!id) return;
    const entry = getStats(id);
    entry.totalInstances += 1;
    if (type === 'order') entry.ordersCount += 1;
    if (type === 'service') entry.servicesCount += 1;
    if (type === 'installation') entry.installationsCount += 1;
    if (type === 'inquiry') entry.inquiriesCount += 1;

    if (date) {
      const d = new Date(date);
      if (!entry.lastInteractionDate || d > new Date(entry.lastInteractionDate)) {
        entry.lastInteractionDate = d.toISOString();
      }
    }
  };

  for (const o of orders) {
    const owner = o.customer ? String(o.customer) : String(o.userId || '');
    recordInstance(owner, o.createdAt, 'order');
  }

  for (const io of installOrders) {
    recordInstance(String(io.userId || ''), io.createdAt, 'order');
  }

  for (const sr of serviceRequests) {
    recordInstance(String(sr.customerId || ''), sr.createdAt, 'service');
  }

  for (const inst of installations) {
    recordInstance(String(inst.customerId || ''), inst.serviceDate || inst.createdAt, 'installation');
  }

  for (const inq of inquiries) {
    recordInstance(String(inq.customer || ''), inq.createdAt, 'inquiry');
  }

  // Enrich customer records
  let enrichedCustomers = customers.map((c) => {
    const id = c._id.toString();
    const stats = statsMap.get(id) || {
      totalInstances: 0,
      ordersCount: 0,
      servicesCount: 0,
      installationsCount: 0,
      inquiriesCount: 0,
      lastInteractionDate: null,
    };

    return {
      _id: c._id,
      fullName: c.fullName,
      lastName: c.lastName || '',
      email: c.email || '',
      phoneNumber: c.phoneNumber || '',
      address: c.address || '',
      gender: c.gender || '',
      isActive: c.isActive !== false,
      totalInstances: stats.totalInstances,
      breakdown: {
        orders: stats.ordersCount,
        services: stats.servicesCount,
        installations: stats.installationsCount,
        inquiries: stats.inquiriesCount,
      },
      lastInteractionDate: stats.lastInteractionDate || c.createdAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  });

  // Filter by past instance history if requested
  if (status === 'with-instances') {
    enrichedCustomers = enrichedCustomers.filter((c) => c.totalInstances > 0);
  } else if (status === 'no-instances') {
    enrichedCustomers = enrichedCustomers.filter((c) => c.totalInstances === 0);
  }

  // Sort by instance count if requested
  if (sortBy === 'instances') {
    enrichedCustomers.sort((a, b) =>
      sortOrder === 'asc' ? a.totalInstances - b.totalInstances : b.totalInstances - a.totalInstances
    );
  }

  // Platform-wide counts
  const [orderUsers, installOrderUsers, serviceUsers, installUsers] = await Promise.all([
    Order.distinct('customer'),
    InstallationOrder.distinct('userId'),
    ServiceRequest.distinct('customerId'),
    Installation.distinct('customerId'),
  ]);

  const distinctActiveClients = new Set([
    ...orderUsers.map(String),
    ...installOrderUsers.map(String),
    ...serviceUsers.map(String),
    ...installUsers.map(String),
  ]);

  const [totalOrderDocs, totalInstallDocs, totalServiceDocs] = await Promise.all([
    Order.countDocuments(),
    InstallationOrder.countDocuments(),
    ServiceRequest.countDocuments(),
  ]);

  const totalInstancesPlatform = totalOrderDocs + totalInstallDocs + totalServiceDocs;

  return {
    success: true,
    summary: {
      totalCustomers: totalCustomersCount,
      activeCustomers: activeCustomersCount,
      customersWithHistory: distinctActiveClients.size,
      totalInstances: totalInstancesPlatform,
    },
    customers: enrichedCustomers,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * GET /api/manager/customers/:id
 * Fetches basic customer profile and the specific past instances worked with AirLux.
 */
exports.getCustomerDetails = async (customerId) => {
  if (!customerId || !mongoose.Types.ObjectId.isValid(String(customerId))) {
    const error = new Error('Invalid customer ID format');
    error.statusCode = 400;
    throw error;
  }

  const customer = await User.findOne({ _id: customerId, role: 'CUSTOMER' })
    .select('fullName lastName email phoneNumber address gender isActive createdAt updatedAt')
    .lean();

  if (!customer) {
    const error = new Error('Customer not found');
    error.statusCode = 404;
    throw error;
  }

  const idStr = String(customerId);
  const idObj = new mongoose.Types.ObjectId(idStr);

  const [orders, installOrders, serviceRequests, installations, inquiries] =
    await Promise.all([
      Order.find({
        $or: [{ userId: idStr }, { customer: idObj }],
      })
        .select('orderRef orderReference orderId orderType status orderStatus createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      InstallationOrder.find({ userId: idStr })
        .select('orderReference orderId status createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      ServiceRequest.find({ customerId: idObj })
        .select('serviceRequestRef serviceType acUnitModel acUnitSerial problemDescription status preferredDate createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      Installation.find({ customerId: idObj })
        .select('assignedTeamName productType location serviceDate status createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      Inquiry.find({ customer: idObj })
        .select('inquiryRef inquiryType subject message status createdAt')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

  const instances = [];

  // 1. Orders
  for (const o of orders) {
    const ref = o.orderRef || o.orderReference || o.orderId || `ORD-${String(o._id).slice(-6).toUpperCase()}`;
    const type = o.orderType || 'Product Order';
    instances.push({
      id: String(o._id),
      type: 'Product Order',
      reference: ref,
      summary: `${type} - ${o.orderStatus || o.status || 'Order Placed'}`,
      date: o.createdAt,
      status: o.status || o.orderStatus || 'Completed',
    });
  }

  // 2. Installation Orders
  for (const io of installOrders) {
    const ref = io.orderReference || io.orderId || `INST-ORD-${String(io._id).slice(-6).toUpperCase()}`;
    instances.push({
      id: String(io._id),
      type: 'Installation Order',
      reference: ref,
      summary: `Buy & Install Order`,
      date: io.createdAt,
      status: io.status || 'Pending Review',
    });
  }

  // 3. Service Requests
  for (const sr of serviceRequests) {
    const ref = sr.serviceRequestRef || `SR-${String(sr._id).slice(-6).toUpperCase()}`;
    const issue = sr.problemDescription ? ` (${sr.problemDescription.slice(0, 50)})` : '';
    instances.push({
      id: String(sr._id),
      type: 'Service / Repair',
      reference: ref,
      summary: `${sr.serviceType || 'Service'}: ${sr.acUnitModel || 'AC Unit'}${issue}`,
      date: sr.preferredDate || sr.createdAt,
      status: sr.status || 'Scheduled',
    });
  }

  // 4. Installations
  for (const inst of installations) {
    instances.push({
      id: String(inst._id),
      type: 'Installation Job',
      reference: `INST-${String(inst._id).slice(-6).toUpperCase()}`,
      summary: `${inst.productType || 'Air Conditioner'} installed by ${inst.assignedTeamName || 'Service Team'}`,
      date: inst.serviceDate || inst.createdAt,
      status: inst.status || 'Completed',
    });
  }

  // 5. Inquiries
  for (const inq of inquiries) {
    const ref = inq.inquiryRef || `INQ-${String(inq._id).slice(-6).toUpperCase()}`;
    instances.push({
      id: String(inq._id),
      type: 'Inquiry',
      reference: ref,
      summary: inq.subject || inq.inquiryType || 'Customer Inquiry',
      date: inq.createdAt,
      status: inq.status || 'Addressed',
    });
  }

  // Sort instances newest to oldest
  instances.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    success: true,
    data: {
      customer: {
        _id: customer._id,
        fullName: customer.fullName,
        lastName: customer.lastName || '',
        email: customer.email || '',
        phoneNumber: customer.phoneNumber || '',
        address: customer.address || '',
        gender: customer.gender || '',
        isActive: customer.isActive !== false,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      totalInstances: instances.length,
      instances,
    },
  };
};
