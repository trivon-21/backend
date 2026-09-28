const User = require('../../models/User');
const Order = require('../../models/Order');
const InstallationOrder = require('../../models/installationOrder.model');
const ServiceTicket = require('../shared/serviceTicket/serviceTicket.model');
const Inquiry = require('../../models/Inquiry');
const MaintenanceSchedule = require('../shared/maintenance/maintenanceSchedule.model');
const Maintenance = require('../shared/maintenance/maintenance.model');
const ServiceRequest = require('../shared/repair/repair.model');
const Installation = require('../shared/installation/installation.model');
const Inspection = require('../shared/inspection/inspectionTicket.model');
const Product = require('../../models/product.model');
const Inventory = require('../../models/Inventory');
const bcrypt = require('bcryptjs');

/**
 * Get products for dropdown selection
 */
exports.getProducts = async () => {
  return Product.find({})
    .select('name brand category capacity sku')
    .sort({ name: 1 })
    .lean();
};

/**
 * ── DASHBOARD OVERVIEW & STATS ─────────────────────────────────────────────
 */
exports.getDashboardStats = async () => {
  const [
    totalCustomers,
    rawRepairs,
    rawMaintenances,
    rawInstallations,
    rawInspections,
    rawServiceTickets,
    awaitingInquiries,
    pendingMaintenance,
    recentInquiries,
    recentCustomers
  ] = await Promise.all([
    User.countDocuments({ role: 'CUSTOMER' }),
    ServiceRequest.find({})
      .populate('customerId', 'fullName lastName name email phoneNumber address')
      .sort({ createdAt: -1 })
      .lean(),
    Maintenance.find({})
      .populate('customerId', 'fullName lastName name email phoneNumber address')
      .sort({ createdAt: -1 })
      .lean(),
    Installation.find({})
      .populate('customerId', 'fullName lastName name email phoneNumber address')
      .sort({ createdAt: -1 })
      .lean(),
    Inspection.find({})
      .populate('customerId', 'fullName lastName name email phoneNumber address')
      .sort({ createdAt: -1 })
      .lean(),
    ServiceTicket.find({})
      .populate('customerId', 'fullName lastName name email phoneNumber address')
      .sort({ createdAt: -1 })
      .lean(),
    Inquiry.countDocuments({ status: 'Awaiting' }),
    MaintenanceSchedule.countDocuments({ status: { $in: ['New', 'Sent to CSA', 'SENT_TO_CSA'] } }),
    Inquiry.find({})
      .populate('customer', 'fullName lastName email phoneNumber')
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
    User.find({ role: 'CUSTOMER' })
      .select('fullName lastName email phoneNumber address createdAt')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
  ]);

  const mappedRepairs = (rawRepairs || []).map(r => {
    const rawId = r.serviceRequestRef || r.ticketId || (r._id ? `SRQ-${r._id.toString().slice(-4).toUpperCase()}` : 'SRQ-1001');
    const formattedId = String(rawId).startsWith('#') ? String(rawId) : `#${rawId}`;
    const cust = r.customerId && typeof r.customerId === 'object' ? r.customerId : {};
    const custName = r.fullName || r.customerName || cust.fullName || cust.name || 'Customer';
    const product = r.productType || r.acUnitModel || 'AirLux AC';
    const status = r.status === 'Scheduled' ? 'Assigned' : (r.status || 'New');
    return {
      _id: r._id,
      ticketId: formattedId,
      customerId: { ...cust, fullName: custName },
      customerName: custName,
      category: 'repair',
      serviceType: 'Repair',
      subject: r.subject || `Repair - ${product}`,
      status,
      priority: r.priority || 'medium',
      createdAt: r.createdAt || new Date()
    };
  });

  const mappedMaintenances = (rawMaintenances || []).map(m => {
    const rawId = m.ticketId || (m._id ? `MS-${m._id.toString().slice(-4).toUpperCase()}` : 'MS-1001');
    const formattedId = String(rawId).startsWith('#') ? String(rawId) : `#${rawId}`;
    const cust = m.customerId && typeof m.customerId === 'object' ? m.customerId : {};
    const custName = m.customerName || cust.fullName || cust.name || 'Customer';
    const product = m.acUnitModel || m.productType || 'AirLux Split AC';
    return {
      _id: m._id,
      ticketId: formattedId,
      customerId: { ...cust, fullName: custName },
      customerName: custName,
      category: 'maintenance',
      serviceType: 'Maintenance',
      subject: m.subject || `Maintenance (${formattedId}) - ${product}`,
      status: m.status || 'New',
      priority: m.priority || 'medium',
      createdAt: m.createdAt || m.date || new Date()
    };
  });

  const mappedInstallations = (rawInstallations || []).map(i => {
    const rawId = i.ticketId || (i._id ? `INT-${i._id.toString().slice(-4).toUpperCase()}` : 'INT-1001');
    const formattedId = String(rawId).startsWith('#') ? String(rawId) : `#${rawId}`;
    const cust = i.customerId && typeof i.customerId === 'object' ? i.customerId : {};
    const custName = i.fullName || i.customerName || cust.fullName || cust.name || 'Customer';
    const product = i.productType || i.itemName || i.acUnitModel || 'AirLux AC System';
    return {
      _id: i._id,
      ticketId: formattedId,
      customerId: { ...cust, fullName: custName },
      customerName: custName,
      category: 'installation',
      serviceType: 'Installation',
      subject: `Installation - ${product}`,
      status: i.status || 'Assigned',
      priority: i.priority || 'medium',
      createdAt: i.createdAt || i.date || new Date()
    };
  });

  const mappedInspections = (rawInspections || []).map(ins => {
    const rawId = ins.ticketId || ins.ticketRef || (ins._id ? `INS-${ins._id.toString().slice(-5).toUpperCase()}` : 'INS-00001');
    const formattedId = String(rawId).startsWith('#') ? String(rawId) : `#${rawId}`;
    const cust = ins.customerId && typeof ins.customerId === 'object' ? ins.customerId : {};
    const custName = ins.customerName || cust.fullName || cust.name || 'Customer';
    const product = ins.productType || (ins.orderId && (ins.orderId.itemName || ins.orderId.productType)) || 'Site Inspection';
    const status = String(ins.status || '') === 'Scheduled' ? 'Assigned' : (ins.status || 'Assigned');
    return {
      _id: ins._id,
      ticketId: formattedId,
      customerId: { ...cust, fullName: custName },
      customerName: custName,
      category: 'inspection',
      serviceType: 'Inspection',
      subject: `Inspection - ${product}`,
      status,
      priority: ins.priority || 'medium',
      createdAt: ins.createdAt || ins.date || new Date()
    };
  });

  const knownIds = new Set();
  const allUnified = [];

  const addTicket = (ticket) => {
    const cleanId = (ticket.ticketId || ticket._id || '').toString().replace('#', '').trim().toUpperCase();
    if (cleanId && knownIds.has(cleanId)) return;
    if (cleanId) knownIds.add(cleanId);
    allUnified.push(ticket);
  };

  mappedRepairs.forEach(addTicket);
  mappedMaintenances.forEach(addTicket);
  mappedInstallations.forEach(addTicket);
  mappedInspections.forEach(addTicket);

  for (const t of (rawServiceTickets || [])) {
    const anyT = t;
    const ref = anyT.serviceRequestRef || (anyT.ticketId ? anyT.ticketId.replace('#', '') : (t._id ? t._id.toString() : ''));
    const cleanRef = ref.trim().toUpperCase();
    if (cleanRef && knownIds.has(cleanRef)) continue;

    let category = (t.category || '').toLowerCase();
    if (!category) {
      const servType = (t.serviceType || '').toLowerCase();
      const subj = (t.subject || '').toLowerCase();
      if (servType === 'maintenance' || subj.includes('maintenance')) {
        category = 'maintenance';
      } else if (servType === 'installation' || subj.includes('installation')) {
        category = 'installation';
      } else if (servType === 'inspection' || subj.includes('inspection')) {
        category = 'inspection';
      } else {
        category = 'repair';
      }
    }

    const cust = t.customerId && typeof t.customerId === 'object' ? t.customerId : {};
    const custName = cust.fullName || cust.name || 'Customer';

    addTicket({
      ...t,
      customerId: { ...cust, fullName: custName },
      customerName: custName,
      category,
      serviceType: t.serviceType || (category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Repair'),
      ticketId: t.ticketId || t.serviceRequestId || (ref ? '#' + ref : '')
    });
  }

  allUnified.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const totalTickets = allUnified.length;
  const activeTickets = allUnified.filter(t => {
    const s = (t.status || '').toLowerCase();
    return s !== 'resolved' && s !== 'rejected' && s !== 'completed' && s !== 'cancelled';
  }).length;

  const highPriorityTickets = allUnified.filter(t => {
    const s = (t.status || '').toLowerCase();
    return (t.priority || '').toLowerCase() === 'high' && s !== 'resolved' && s !== 'rejected' && s !== 'completed' && s !== 'cancelled';
  }).length;

  const recentTickets = allUnified.slice(0, 5);

  return {
    metrics: {
      totalCustomers,
      activeTickets,
      totalTickets,
      allTickets: totalTickets,
      highPriorityTickets,
      awaitingInquiries,
      pendingInquiries: awaitingInquiries,
      pendingMaintenance
    },
    recentTickets,
    recentInquiries,
    recentCustomers
  };
};

/**
 * ── CUSTOMERS MANAGEMENT ───────────────────────────────────────────────────
 */
exports.getCustomers = async ({ search = '', page = 1, limit = 15 }) => {
  const query = { role: 'CUSTOMER' };

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s, 'i');
    query.$or = [
      { fullName: regex },
      { lastName: regex },
      { email: regex },
      { phoneNumber: regex },
      { address: regex }
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const skip = (pageNum - 1) * limitNum;

  const [customers, total] = await Promise.all([
    User.find(query)
      .select('fullName lastName email phoneNumber address gender isActive createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    User.countDocuments(query)
  ]);

  // Enrich with order counts
  const customerIds = customers.map(c => c._id.toString());
  const orders = await Order.find({ userId: { $in: customerIds } }).select('userId').lean();
  const orderCountMap = {};
  orders.forEach(o => {
    orderCountMap[o.userId] = (orderCountMap[o.userId] || 0) + 1;
  });

  const enrichedCustomers = customers.map(c => ({
    ...c,
    ordersCount: orderCountMap[c._id.toString()] || 0
  }));

  return {
    customers: enrichedCustomers,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum)
  };
};

exports.createCustomer = async ({ firstName, lastName, email, phoneNumber, address, city, gender, initialPassword }) => {
  if (!firstName || !firstName.trim()) {
    throw new Error('First Name is required');
  }

  if (!/^[a-zA-Z\s]+$/.test(firstName.trim())) {
    throw new Error('First Name can only contain letters');
  }

  if (!lastName || !lastName.trim()) {
    throw new Error('Last Name is required');
  }

  if (!/^[a-zA-Z\s]+$/.test(lastName.trim())) {
    throw new Error('Last Name can only contain letters');
  }

  if (lastName.trim().length < 2) {
    throw new Error('Last Name must be at least 2 characters');
  }

  const cleanPhone = phoneNumber ? phoneNumber.trim() : '';
  const cleanEmail = email ? email.toLowerCase().trim() : '';

  if (!cleanPhone && !cleanEmail) {
    throw new Error('At least one contact method (Phone Number or Email Address) is required');
  }

  if (cleanPhone) {
    if (!/^0\d{9}$/.test(cleanPhone)) {
      throw new Error('Phone number must be exactly 10 digits and start with 0 (e.g., 0771234567)');
    }
    const existingPhone = await User.findOne({ phoneNumber: cleanPhone });
    if (existingPhone) {
      throw new Error('A customer with this phone number already exists');
    }
  }

  if (cleanEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Please enter a valid email format');
    }
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      throw new Error('A customer with this email already exists');
    }
  }

  let fullAddress = address ? address.trim() : '';
  if (city && city.trim() && !fullAddress.toLowerCase().includes(city.trim().toLowerCase())) {
    fullAddress = fullAddress ? `${fullAddress}, ${city.trim()}` : city.trim();
  }

  // Generate initial password hash
  const pwdToHash = initialPassword && initialPassword.trim() ? initialPassword.trim() : `AirLux@${Math.floor(1000 + Math.random() * 9000)}`;
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(pwdToHash, salt);

  const newUser = new User({
    fullName: firstName.trim(),
    lastName: (lastName || '').trim(),
    email: cleanEmail || undefined,
    phoneNumber: cleanPhone || undefined,
    address: fullAddress,
    gender: gender || '',
    role: 'CUSTOMER',
    passwordHash,
    isActive: true,
    emailVerified: false,
    phoneVerified: false
  });

  await newUser.save();

  // If email was provided, dispatch welcome credentials email
  let emailSent = false;
  let emailError = null;
  if (cleanEmail) {
    try {
      const { sendCustomerWelcomeEmail } = require('../shared/notification/email.service');
      const customerFullName = `${firstName.trim()} ${(lastName || '').trim()}`.trim();
      const mailRes = await sendCustomerWelcomeEmail({
        email: cleanEmail,
        customerName: customerFullName,
        initialPassword: pwdToHash
      });
      emailSent = mailRes?.success || false;
      if (!emailSent) {
        emailError = mailRes?.error || 'Email could not be delivered';
      }
    } catch (mailErr) {
      console.error('[createCustomer] Failed to send credentials email:', mailErr.message);
      emailError = mailErr.message;
    }
  }

  return {
    customer: {
      _id: newUser._id,
      fullName: newUser.fullName,
      lastName: newUser.lastName,
      email: newUser.email,
      phoneNumber: newUser.phoneNumber,
      address: newUser.address,
      gender: newUser.gender,
      role: newUser.role,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt
    },
    emailSent,
    emailError,
    generatedPassword: pwdToHash
  };
};

exports.getCustomerById = async (id) => {
  const customer = await User.findOne({ _id: id, role: 'CUSTOMER' })
    .select('fullName lastName email phoneNumber address gender isActive createdAt updatedAt')
    .lean();

  if (!customer) throw new Error('Customer not found');

  const [orders, installOrders] = await Promise.all([
    Order.find({ userId: id }).sort({ createdAt: -1 }).lean(),
    InstallationOrder.find({ userId: id }).sort({ createdAt: -1 }).lean()
  ]);

  return {
    customer,
    orders,
    installOrders
  };
};

/**
 * ── SERVICE TICKETS ────────────────────────────────────────────────────────
 */
exports.getServiceTickets = async ({ search = '', category = '', status = '', priority = '', page = 1, limit = 15 }) => {
  const query = {};

  if (category && category !== 'ALL') {
    query.category = category.toLowerCase();
  }

  if (status && status !== 'ALL') {
    query.status = status;
  }

  if (priority && priority !== 'ALL') {
    query.priority = priority.toLowerCase();
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s, 'i');
    query.$or = [
      { subject: regex },
      { description: regex },
      { acUnitModel: regex },
      { acUnitSerial: regex }
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const skip = (pageNum - 1) * limitNum;

  const [tickets, total] = await Promise.all([
    ServiceTicket.find(query)
      .populate('customerId', 'fullName lastName email phoneNumber address')
      .populate('assignedTechnicianId', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    ServiceTicket.countDocuments(query)
  ]);

  const formattedTickets = tickets.map((t) => {
    let tId = t.ticketId || t.serviceRequestId || t.serviceRequestRef;
    const cat = (t.category || 'repair').toLowerCase();
    if (!tId) {
      const hex = t._id ? t._id.toString().slice(-4).toUpperCase() : '1001';
      const num = 1000 + (parseInt(hex, 16) % 9000);
      if (cat === 'installation') {
        tId = `#INT-${num}`;
      } else if (cat === 'inspection') {
        tId = `#INS-${String(num).padStart(5, '0')}`;
      } else if (cat === 'maintenance') {
        tId = `#MS-${num}`;
      } else {
        tId = `#SRQ-${num}`;
      }
    } else if (!tId.startsWith('#')) {
      tId = `#${tId}`;
    }
    return {
      ...t,
      ticketId: tId
    };
  });

  return {
    tickets: formattedTickets,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum)
  };
};

exports.createServiceTicket = async ({
  customerId,
  category = 'repair',
  subject,
  description,
  priority = 'medium',
  acUnitModel = '',
  acUnitSerial = '',
  preferredDate,
  preferredTimeSlot = '',
  serviceFee = 0
}) => {
  if (!customerId) throw new Error('Customer is required');
  if (!description || !description.trim()) throw new Error('Description is required');

  const customer = await User.findById(customerId);
  if (!customer) throw new Error('Selected customer not found');

  const normalizedCategory = (category || 'repair').toLowerCase();
  const requestTypeMap = {
    repair: 'Repair',
    maintenance: 'Maintenance',
    installation: 'Installation',
    inspection: 'Inspection'
  };

  let prefix = 'SRQ';
  let padLen = 4;
  if (normalizedCategory === 'installation') {
    prefix = 'INT';
    padLen = 4;
  } else if (normalizedCategory === 'inspection') {
    prefix = 'INS';
    padLen = 5;
  } else if (normalizedCategory === 'maintenance') {
    prefix = 'MS';
    padLen = 4;
  }

  let generatedTicketId = '';
  try {
    const mongoose = require('mongoose');
    require('../../../models/counter.model');
    const CounterModel = mongoose.model('Counter');
    let counter = await CounterModel.findOneAndUpdate(
      { _id: `csa_${prefix}_ticket` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    if (!counter || counter.seq < 1001) {
      counter = await CounterModel.findOneAndUpdate(
        { _id: `csa_${prefix}_ticket` },
        { $set: { seq: 1001 } },
        { new: true, upsert: true }
      );
    }
    generatedTicketId = `#${prefix}-${String(counter.seq).padStart(padLen, '0')}`;
  } catch (cErr) {
    const count = await ServiceTicket.countDocuments({ category: normalizedCategory });
    generatedTicketId = `#${prefix}-${String(1001 + count).padStart(padLen, '0')}`;
  }

  const newTicket = new ServiceTicket({
    ticketId: generatedTicketId,
    serviceRequestId: generatedTicketId.replace('#', ''),
    customerId,
    category: normalizedCategory,
    requestType: requestTypeMap[normalizedCategory] || 'Repair',
    maintenanceType: normalizedCategory === 'maintenance' ? 'Company Initiated' : undefined,
    subject: subject && subject.trim() ? subject.trim() : `${requestTypeMap[normalizedCategory] || 'Service'} Request`,
    description: description.trim(),
    priority: (priority || 'medium').toLowerCase(),
    status: 'New',
    acUnitModel: acUnitModel.trim(),
    acUnitSerial: acUnitSerial.trim(),
    preferredDate: preferredDate ? new Date(preferredDate) : undefined,
    preferredTimeSlot: preferredTimeSlot.trim(),
    serviceFee: Number(serviceFee) || 0,
    paymentStatus: 'NEW'
  });

  await newTicket.save();

  if (normalizedCategory === 'maintenance') {
    try {
      const MaintenanceSchedule = require('../shared/maintenance/maintenanceSchedule.model');
      const { buildServiceTemplate } = require('../shared/maintenance/scheduleTemplate');
      const schedTicketId = generatedTicketId.replace('#', '');
      await MaintenanceSchedule.create({
        ticketId: schedTicketId,
        customerId: customer._id,
        status: 'New',
        services: buildServiceTemplate(),
        csaNotes: `Logged via CSA Portal: ${description.trim()}`
      });
    } catch (schedErr) {
      console.error('Failed to auto-create maintenance schedule from CSA ticket:', schedErr);
    }
  }

  const populated = await ServiceTicket.findById(newTicket._id)
    .populate('customerId', 'fullName lastName email phoneNumber address')
    .lean();

  return {
    ...populated,
    ticketId: generatedTicketId
  };
};

exports.updateServiceTicketStatus = async (ticketId, { status, rejectionReason }) => {
  // First verify the ticket exists
  const existing = await ServiceTicket.findById(ticketId).lean();
  if (!existing) throw new Error('Ticket not found');

  // Build only the fields we want to change — avoids triggering
  // full Mongoose validation (which would fail on required fields
  // like `description` that may be absent on older records).
  const updateFields = {};
  if (status) updateFields.status = status;
  if (rejectionReason !== undefined) updateFields.rejectionReason = rejectionReason;

  await ServiceTicket.findByIdAndUpdate(
    ticketId,
    { $set: updateFields },
    { new: false, runValidators: false }
  );

  return ServiceTicket.findById(ticketId)
    .populate('customerId', 'fullName lastName email phoneNumber address')
    .lean();
};

/**
 * ── INQUIRIES & COMMUNICATION ──────────────────────────────────────────────
 */
exports.getInquiries = async ({ search = '', status = '', page = 1, limit = 20 }) => {
  const query = {};

  if (status && status !== 'ALL') {
    if (status === 'Ongoing') {
      query.status = { $in: ['Ongoing', 'Addressed'] };
    } else {
      query.status = status;
    }
  }

  if (search && search.trim()) {
    const s = search.trim();
    const regex = new RegExp(s, 'i');
    query.$or = [
      { inquiryRef: regex },
      { subject: regex },
      { name: regex },
      { email: regex },
      { phone: regex },
      { message: regex }
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [inquiries, total] = await Promise.all([
    Inquiry.find(query)
      .populate('customer', 'fullName lastName email phoneNumber')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Inquiry.countDocuments(query)
  ]);

  return {
    inquiries,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum)
  };
};

exports.replyToInquiry = async (inquiryId, { message, newStatus }) => {
  if (!message || !message.trim()) {
    throw new Error('Reply message is required');
  }

  const inquiry = await Inquiry.findById(inquiryId);
  if (!inquiry) throw new Error('Inquiry not found');

  if (inquiry.status === 'Closed') {
    throw new Error('Cannot reply to a closed inquiry. Please reopen the inquiry first.');
  }

  inquiry.thread.push({
    sender: 'Support',
    message: message.trim()
  });

  // Automatically transition Awaiting -> Ongoing when CSA replies
  if (inquiry.status === 'Awaiting') {
    inquiry.status = 'Ongoing';
  } else if (newStatus) {
    inquiry.status = newStatus;
  } else if (inquiry.status !== 'Closed') {
    inquiry.status = 'Ongoing';
  }

  await inquiry.save();

  // Push notification to the customer
  if (inquiry.customer) {
    try {
      const customer = await User.findById(inquiry.customer);
      if (customer) {
        if (!customer.notifications) customer.notifications = [];
        customer.notifications.push({
          type: 'inquiry',
          title: 'New Reply from AirLux Support',
          message: `Support replied to inquiry ${inquiry.inquiryRef}: "${message.trim().substring(0, 80)}"`,
          read: false,
          actionUrl: '/dashboard',
          createdAt: new Date()
        });
        await customer.save();
      }
    } catch (notifErr) {
      console.error('Failed to push notification to customer:', notifErr);
    }
  }

  const populated = await Inquiry.findById(inquiryId)
    .populate('customer', 'fullName lastName email phoneNumber')
    .lean();

  return populated;
};

exports.updateInquiryStatus = async (inquiryId, status) => {
  const inquiry = await Inquiry.findById(inquiryId);
  if (!inquiry) throw new Error('Inquiry not found');

  inquiry.status = status;
  await inquiry.save();

  return Inquiry.findById(inquiryId)
    .populate('customer', 'fullName lastName email phoneNumber')
    .lean();
};

/**
 * ── CATALOG PRODUCTS MANAGEMENT (AC Equipment) ───────────────────────────
 */
exports.getCatalogProducts = async (filters = {}) => {
  const query = {
    $or: [
      { category: 'AC Equipment' },
      { itemClass: 'AC Equipment' }
    ]
  };

  if (filters.search && filters.search.trim()) {
    const searchRegex = new RegExp(filters.search.trim(), 'i');
    query.$and = [
      {
        $or: [
          { name: searchRegex },
          { brand: searchRegex },
          { subcategory: searchRegex },
          { sku: searchRegex },
          { description: searchRegex }
        ]
      }
    ];
  }

  const items = await Inventory.find(query)
    .sort({ createdAt: -1 })
    .lean();

  return items.map(doc => ({
    _id: doc._id,
    name: doc.name,
    brand: doc.brand,
    sku: doc.sku,
    category: doc.subcategory || doc.category || 'AC Equipment',
    subcategory: doc.subcategory || 'Split Indoor Unit',
    description: doc.description || '',
    image: doc.image || 'placeholder.png',
    images: doc.images || [],
    features: doc.features || [],
    capacity: doc.capacityBtu || doc.capacity || 12000,
    price: (doc.pricing && doc.pricing.sellingPricePerUnit !== undefined)
      ? doc.pricing.sellingPricePerUnit
      : (doc.price !== undefined ? doc.price : (doc.pricing?.costPerUnit || doc.unitCost || 0)),
    unitCost: doc.unitCost || doc.pricing?.costPerUnit || 0,
    available: doc.available || 0,
    inStock: doc.available !== undefined ? doc.available > 0 : true,
    location: doc.location || 'Warehouse',
    binLocation: doc.binLocation || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }));
};

exports.updateCatalogProduct = async (id, { image, description, features }) => {
  const item = await Inventory.findById(id);
  if (!item) {
    throw new Error('Product not found in inventory');
  }

  // Strictly update ONLY the 3 permitted presentation parameters
  if (image !== undefined) {
    item.image = String(image).trim();
  }

  if (description !== undefined) {
    item.description = String(description).trim();
  }

  if (features !== undefined) {
    if (Array.isArray(features)) {
      item.features = features.map(f => String(f).trim()).filter(Boolean);
    } else if (typeof features === 'string') {
      item.features = features.split('\n').map(f => f.trim()).filter(Boolean);
    }
  }

  item.updatedAt = new Date();
  await item.save();

  return {
    _id: item._id,
    name: item.name,
    brand: item.brand,
    sku: item.sku,
    category: item.subcategory || item.category || 'AC Equipment',
    subcategory: item.subcategory || 'Split Indoor Unit',
    description: item.description,
    image: item.image,
    features: item.features,
    capacity: item.capacityBtu || item.capacity || 12000,
    price: (item.pricing && item.pricing.sellingPricePerUnit !== undefined)
      ? item.pricing.sellingPricePerUnit
      : (item.price !== undefined ? item.price : (item.pricing?.costPerUnit || item.unitCost || 0)),
    available: item.available || 0,
    inStock: item.available > 0,
    updatedAt: item.updatedAt
  };
};
