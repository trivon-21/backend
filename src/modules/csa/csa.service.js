const User = require('../../models/User');
const Order = require('../../models/Order');
const InstallationOrder = require('../../models/installationOrder.model');
const ServiceTicket = require('../shared/serviceTicket/serviceTicket.model');
const Inquiry = require('../../models/Inquiry');
const MaintenanceSchedule = require('../shared/maintenance/maintenanceSchedule.model');
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
    activeTickets,
    highPriorityTickets,
    pendingInquiries,
    pendingMaintenance,
    recentTickets,
    recentInquiries,
    recentCustomers
  ] = await Promise.all([
    User.countDocuments({ role: 'CUSTOMER' }),
    ServiceTicket.countDocuments({ status: { $nin: ['resolved', 'Rejected'] } }),
    ServiceTicket.countDocuments({ priority: 'high', status: { $nin: ['resolved', 'Rejected'] } }),
    Inquiry.countDocuments({ status: 'Ongoing' }),
    MaintenanceSchedule.countDocuments({ status: { $in: ['New', 'Sent to CSA', 'SENT_TO_CSA'] } }),
    ServiceTicket.find({})
      .populate('customerId', 'fullName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
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

  return {
    metrics: {
      totalCustomers,
      activeTickets,
      highPriorityTickets,
      pendingInquiries,
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

  if (lastName && lastName.trim() && !/^[a-zA-Z\s]+$/.test(lastName.trim())) {
    throw new Error('Last Name can only contain letters');
  }

  const cleanPhone = phoneNumber ? phoneNumber.trim() : '';
  if (cleanPhone) {
    if (!/^0\d{9}$/.test(cleanPhone)) {
      throw new Error('Phone number must be exactly 10 digits and start with 0 (e.g., 0771234567)');
    }
    const existingPhone = await User.findOne({ phoneNumber: cleanPhone });
    if (existingPhone) {
      throw new Error('A customer with this phone number already exists');
    }
  }

  const cleanEmail = email ? email.toLowerCase().trim() : '';
  if (cleanEmail) {
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
  const pwdToHash = initialPassword || `AirLux@${Math.floor(1000 + Math.random() * 9000)}`;
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

  return {
    customer: {
      _id: newUser._id,
      fullName: newUser.fullName,
      lastName: newUser.lastName,
      email: newUser.email,
      phoneNumber: newUser.phoneNumber,
      address: newUser.address,
      gender: newUser.gender,
      createdAt: newUser.createdAt
    },
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

  return {
    tickets,
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

  const newTicket = new ServiceTicket({
    customerId,
    category: normalizedCategory,
    requestType: requestTypeMap[normalizedCategory] || 'Repair',
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

  const populated = await ServiceTicket.findById(newTicket._id)
    .populate('customerId', 'fullName lastName email phoneNumber address')
    .lean();

  return populated;
};

exports.updateServiceTicketStatus = async (ticketId, { status, rejectionReason }) => {
  const ticket = await ServiceTicket.findById(ticketId);
  if (!ticket) throw new Error('Ticket not found');

  if (status) ticket.status = status;
  if (rejectionReason) ticket.rejectionReason = rejectionReason;

  await ticket.save();

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
    query.status = status;
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

exports.replyToInquiry = async (inquiryId, { message, newStatus = 'Addressed' }) => {
  if (!message || !message.trim()) {
    throw new Error('Reply message is required');
  }

  const inquiry = await Inquiry.findById(inquiryId);
  if (!inquiry) throw new Error('Inquiry not found');

  inquiry.thread.push({
    sender: 'Support',
    message: message.trim()
  });

  if (newStatus) {
    inquiry.status = newStatus;
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
