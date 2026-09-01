const service = require("./super-admin.service");

/**
 * Create a new user
 * POST /api/super-admin/users
 * Body: { fullName, email, phoneNumber, role, password }
 */
exports.createUser = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, role, password } = req.body;

    if (!fullName || !password || !role) {
      return res.status(400).json({
        message: "fullName, password, and role are required"
      });
    }

    if (!email && !phoneNumber) {
      return res.status(400).json({
        message: "Either email or phone number is required"
      });
    }

    const user = await service.createUser({
      fullName,
      email: email || null,
      phoneNumber: phoneNumber || null,
      role,
      password
    });

    return res.status(201).json({
      message: "User created successfully. OTP(s) sent for verification.",
      user
    });
  } catch (err) {
    if (err.message.includes("already exists")) {
      return res.status(409).json({ message: err.message });
    }
    if (err.message.includes("Invalid")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Get user by ID
 * GET /api/super-admin/users/:userId
 */
exports.getUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await service.getUserById(userId);

    return res.json({
      message: "User retrieved successfully",
      user
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * List all users with pagination, filters, and search
 * GET /api/super-admin/users
 * Query params: page, limit, role, emailVerified, phoneVerified, search
 */
exports.listUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, emailVerified, phoneVerified, search } = req.query;

    const result = await service.listUsers({
      page,
      limit,
      role: role || null,
      emailVerified: emailVerified || null,
      phoneVerified: phoneVerified || null,
      search: search || null
    });

    return res.json({
      message: "Users retrieved successfully",
      ...result
    });
  } catch (err) {
    if (err.message.includes("Invalid")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Get dashboard summary counts
 * GET /api/super-admin/dashboard-summary
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const summary = await service.getDashboardSummary();
    return res.json({ message: "Dashboard summary retrieved successfully", data: summary });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Update user details
 * PUT /api/super-admin/users/:userId
 * Body: { fullName, email, phoneNumber, role }
 */
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { fullName, email, phoneNumber, role } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!fullName && !email && !phoneNumber && !role) {
      return res.status(400).json({
        message: "At least one field (fullName, email, phoneNumber, or role) is required"
      });
    }

    const user = await service.updateUser(userId, {
      fullName,
      email,
      phoneNumber,
      role
    });

    return res.json({
      message: "User updated successfully",
      user
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    if (err.message.includes("Invalid") || err.message.includes("already")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Delete user (soft or hard delete)
 * DELETE /api/super-admin/users/:userId
 * Query params: hardDelete (true/false, default: false for soft delete)
 */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { hardDelete = false } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const isHardDelete = hardDelete === "true" || hardDelete === true;

    const result = await service.deleteUser(userId, isHardDelete);

    return res.json(result);
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Deactivate user
 * PATCH /api/super-admin/users/:userId/deactivate
 * Body: { reason }
 */
exports.deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await service.deactivateUser(userId, reason || "");

    return res.json({
      message: "User deactivated successfully. Email sent.",
      user
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Get reactivation requests
 * GET /api/super-admin/reactivation-requests
 * Query params: page, limit, status
 */
exports.getReactivationRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = "pending" } = req.query;

    const result = await service.getReactivationRequests({
      page,
      limit,
      status
    });

    return res.json({
      message: "Reactivation requests retrieved successfully",
      ...result
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Handle reactivation request (approve/reject)
 * PATCH /api/super-admin/reactivation-requests/:userId
 * Body: { approve, adminResponse }
 */
exports.handleReactivationRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const { approve, adminResponse = "" } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (approve === undefined || approve === null) {
      return res.status(400).json({ message: "approve field is required (true/false)" });
    }

    const result = await service.handleReactivationRequest(userId, approve, adminResponse);

    return res.json(result);
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    if (err.message.includes("No pending")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Submit reactivation request (user-accessible)
 * POST /api/user/reactivation-request
 * Body: { email, userReason }
 */
exports.submitReactivationRequest = async (req, res) => {
  try {
    const { email, userReason } = req.body;

    if (!email || !userReason) {
      return res.status(400).json({ message: "Email and userReason are required" });
    }

    const result = await service.submitReactivationRequest(email, userReason);

    return res.json(result);
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    if (err.message.includes("already active")) {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * List inquiries
 * GET /api/super-admin/inquiries
 */
exports.listInquiries = async (req, res) => {
  try {
    const { page = 1, limit = 10, inquiryType, status, search } = req.query;
    const result = await service.listInquiries({
      page,
      limit,
      inquiryType: inquiryType || null,
      status: status || null,
      search: search || null
    });
    return res.json({
      message: "Inquiries retrieved successfully",
      ...result
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Update inquiry status
 * PATCH /api/super-admin/inquiries/:id/status
 */
exports.updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    const inquiry = await service.updateInquiryStatus(id, status);
    return res.json({
      message: "Inquiry status updated successfully",
      data: inquiry
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Reply to inquiry
 * POST /api/super-admin/inquiries/:id/reply
 */
exports.replyInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: "Message is required" });
    }
    const inquiry = await service.replyInquiry(id, message.trim());
    return res.json({
      message: "Reply added successfully",
      data: inquiry
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * List service requests
 * GET /api/super-admin/service-requests
 */
exports.listServiceRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, serviceType, status, search } = req.query;
    const result = await service.listServiceRequests({
      page,
      limit,
      serviceType: serviceType || null,
      status: status || null,
      search: search || null
    });
    return res.json({
      message: "Service requests retrieved successfully",
      ...result
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Update service request status
 * PATCH /api/super-admin/service-requests/:id/status
 */
exports.updateServiceRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    const serviceRequest = await service.updateServiceRequestStatus(id, status);
    return res.json({
      message: "Service request status updated successfully",
      data: serviceRequest
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * List orders
 * GET /api/super-admin/orders
 */
exports.listOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, orderType, status, paymentStatus, search } = req.query;
    const result = await service.listOrders({
      page,
      limit,
      orderType: orderType || null,
      status: status || null,
      paymentStatus: paymentStatus || null,
      search: search || null
    });
    return res.json({
      message: "Orders retrieved successfully",
      ...result
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Update order status
 * PATCH /api/super-admin/orders/:id/status
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, orderStatus } = req.body;
    const order = await service.updateOrderStatus(id, { status, paymentStatus, orderStatus });
    return res.json({
      message: "Order status updated successfully",
      data: order
    });
  } catch (err) {
    if (err.message.includes("not found")) {
      return res.status(404).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


