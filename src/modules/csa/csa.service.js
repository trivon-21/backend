const User = require('../../models/User');
const Order = require('../../models/Order');
const InstallationOrder = require('../../models/installationOrder.model');
const ServiceTicket = require('../shared/serviceTicket/serviceTicket.model');
const Inquiry = require('../../models/Inquiry');
const MaintenanceSchedule = require('../shared/maintenance/maintenanceSchedule.model');
const Maintenance = require('../shared/maintenance/maintenance.model');
const Product = require('../../models/product.model');
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
    rawServiceTickets,
    rawMaintenances,
    awaitingInquiries,
    pendingMaintenance,
    recentInquiries,
    recentCustomers
  ] = await Promise.all([
    User.countDocuments({ role: 'CUSTOMER' }),
    ServiceTicket.find({})
      .populate('customerId', 'fullName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .lean(),
    Maintenance.find({})
      .populate('customerId', 'fullName lastName email phoneNumber')
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

  const mappedMaintenances = rawMaintenances.map(m => ({
    _id: m._id,
    ticketId: m.ticketId,
    subject: m.subject || `Maintenance (${m.ticketId || ''}) - ${m.acUnitModel || m.productType || 'AirLux Split AC'}`,
    category: 'maintenance',
    serviceType: 'Maintenance',
    status: m.status || 'New',
    priority: 'medium',
    customerId: m.customerId,
    createdAt: m.createdAt || m.date
  }));

  const maintenanceTicketIds = new Set(
    mappedMaintenances.map(m => (m.ticketId || '').replace('#', '').trim().toUpperCase())
  );

  const normalizedServiceTickets = [];
  for (const t of rawServiceTickets) {
    const ref = (t.serviceRequestRef || t.ticketId || '').replace('#', '').trim().toUpperCase();
    if (ref && maintenanceTicketIds.has(ref)) {
      continue;
    }
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
    normalizedServiceTickets.push({
      ...t,
      category,
      serviceType: t.serviceType || (category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Repair'),
      ticketId: t.ticketId || t.serviceRequestId || (ref ? '#' + ref : '')
    });
  }

  const allUnified = [...normalizedServiceTickets, ...mappedMaintenances];
  allUnified.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
    } catch (mailErr) {
      console.error('[createCustomer] Failed to send credentials email:', mailErr.message);
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
    generatedPassword: initialPassword ? undefined : pwdToHash
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
