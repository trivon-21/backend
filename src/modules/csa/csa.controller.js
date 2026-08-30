const csaService = require('./csa.service');

// ── DASHBOARD OVERVIEW ─────────────────────────────────────────────────────

// GET /api/csa/dashboard-stats
exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await csaService.getDashboardStats();
    return res.json({ success: true, ...stats });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/csa/products
exports.getProducts = async (req, res) => {
  try {
    const products = await csaService.getProducts();
    return res.json({ success: true, products });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── CUSTOMERS ─────────────────────────────────────────────────────────────

// GET /api/csa/customers
exports.getCustomers = async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const result = await csaService.getCustomers({ search, page, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/csa/customers
exports.createCustomer = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, address, city, gender, initialPassword } = req.body;
    const result = await csaService.createCustomer({
      firstName,
      lastName,
      email,
      phoneNumber,
      address,
      city,
      gender,
      initialPassword
    });
    return res.status(201).json({
      success: true,
      message: 'Customer profile created successfully',
      ...result
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// GET /api/csa/customers/:id
exports.getCustomerById = async (req, res) => {
  try {
    const result = await csaService.getCustomerById(req.params.id);
    return res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.message.includes('not found') ? 404 : 500).json({ success: false, message: err.message });
  }
};

// ── SERVICE TICKETS ───────────────────────────────────────────────────────

// GET /api/csa/service-tickets
exports.getServiceTickets = async (req, res) => {
  try {
    const { search, category, status, priority, page, limit } = req.query;
    const result = await csaService.getServiceTickets({ search, category, status, priority, page, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/csa/service-tickets
exports.createServiceTicket = async (req, res) => {
  try {
    const {
      customerId,
      category,
      subject,
      description,
      priority,
      acUnitModel,
      acUnitSerial,
      preferredDate,
      preferredTimeSlot,
      serviceFee
    } = req.body;

    const ticket = await csaService.createServiceTicket({
      customerId,
      category,
      subject,
      description,
      priority,
      acUnitModel,
      acUnitSerial,
      preferredDate,
      preferredTimeSlot,
      serviceFee
    });

    return res.status(201).json({
      success: true,
      message: 'Service ticket created successfully',
      ticket
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// PATCH /api/csa/service-tickets/:id/status
exports.updateServiceTicketStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const ticket = await csaService.updateServiceTicketStatus(req.params.id, { status, rejectionReason });
    return res.json({
      success: true,
      message: 'Service ticket status updated',
      ticket
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// ── INQUIRIES & COMMUNICATION ──────────────────────────────────────────────

// GET /api/csa/inquiries
exports.getInquiries = async (req, res) => {
  try {
    const { search, status, page, limit } = req.query;
    const result = await csaService.getInquiries({ search, status, page, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/csa/inquiries/:id/reply
exports.replyToInquiry = async (req, res) => {
  try {
    const { message, newStatus } = req.body;
    const inquiry = await csaService.replyToInquiry(req.params.id, { message, newStatus });
    return res.json({
      success: true,
      message: 'Reply sent and customer notified successfully',
      inquiry
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// PATCH /api/csa/inquiries/:id/status
exports.updateInquiryStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const inquiry = await csaService.updateInquiryStatus(req.params.id, status);
    return res.json({
      success: true,
      message: 'Inquiry status updated',
      inquiry
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};
