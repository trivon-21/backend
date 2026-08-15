/**
 * LOGGING INTEGRATION GUIDE
 *
 * This file provides examples of how to integrate logging throughout the AirLux system.
 * Copy these patterns to integrate logging in your controllers.
 */

/**
 * ============================================================================
 * EXAMPLE 1: Log Activity in a Controller
 * ============================================================================
 *
 * Use this pattern for successful actions like creating, updating, or deleting records.
 */

const { logAction, logError, logSecurityEvent } = require('../../middleware/action-logging');
const LoggingService = require('../../utils/logging-service');

// Example: Create Order (Activity Log)
async function createOrderExample(req, res) {
  try {
    // ... your order creation logic ...
    const order = { _id: '123', orderRef: 'ORD001', amount: 50000 };

    // Log the activity
    await logAction(req, res, {
      module: 'ORDER_MANAGEMENT',
      action: 'Order Created',
      actionCategory: 'CREATE',
      entity: 'Order',
      entityId: order._id,
      changes: {
        after: order,
      },
      reason: 'Customer placed new order',
      metadata: {
        orderRef: order.orderRef,
        amount: order.amount,
      },
    });

    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    // Log the error
    await logError(req, res, {
      module: 'ORDER_MANAGEMENT',
      action: 'Create Order Failed',
      actionCategory: 'CREATE',
      entity: 'Order',
      error,
      errorType: 'ORDER_CREATION_ERROR',
      metadata: {
        body: req.body,
      },
    });

    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * ============================================================================
 * EXAMPLE 2: Log Profile Updates (User Profile Changes)
 * ============================================================================
 */

async function updateUserProfileExample(req, res) {
  try {
    const userId = req.user._id;
    const oldUserData = { phone: '+94112345678', address: 'Old Address' };
    const newUserData = { phone: '+94779999999', address: 'New Address' };

    // ... update logic ...

    await logAction(req, res, {
      module: 'USER_MANAGEMENT',
      action: 'User Profile Updated',
      actionCategory: 'UPDATE',
      entity: 'UserProfile',
      entityId: userId,
      changes: {
        before: {
          phone: oldUserData.phone,
          address: oldUserData.address,
        },
        after: {
          phone: newUserData.phone,
          address: newUserData.address,
        },
      },
      reason: 'User updated their profile information',
      metadata: {
        fieldsChanged: ['phone', 'address'],
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    await logError(req, res, {
      module: 'USER_MANAGEMENT',
      action: 'Update Profile Failed',
      actionCategory: 'UPDATE',
      entity: 'UserProfile',
      error,
      errorType: 'PROFILE_UPDATE_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 3: Log Photo Upload
 * ============================================================================
 */

async function uploadPhotoExample(req, res) {
  try {
    // ... file upload logic ...
    const photoPath = '/uploads/photo123.jpg';
    const fileSize = 245120; // bytes

    await logAction(req, res, {
      module: 'USER_MANAGEMENT',
      action: 'Profile Photo Uploaded',
      actionCategory: 'CREATE',
      entity: 'ProfilePhoto',
      entityId: req.user._id,
      changes: {
        after: {
          photoPath,
          fileSize,
        },
      },
      metadata: {
        fileName: req.file.originalname,
        fileSize,
        mimeType: req.file.mimetype,
      },
    });

    return res.status(200).json({ success: true, path: photoPath });
  } catch (error) {
    await logError(req, res, {
      module: 'USER_MANAGEMENT',
      action: 'Photo Upload Failed',
      actionCategory: 'CREATE',
      entity: 'ProfilePhoto',
      error,
      errorType: 'FILE_UPLOAD_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 4: Log Failed Login Attempts (Security Log)
 * ============================================================================
 */

async function loginExample(req, res) {
  try {
    const { email, password } = req.body;

    // ... authentication logic ...

    // If authentication fails:
    const failedAttempts = 3; // Track failed attempts

    if (failedAttempts >= 5) {
      // Log critical security event
      await logSecurityEvent(req, res, {
        module: 'AUTH',
        action: 'FAILED_LOGIN',
        riskLevel: 'CRITICAL',
        securityFlags: ['ACCOUNT_LOCKOUT', 'BRUTE_FORCE_DETECTED'],
        userId: null, // Unknown user at this point
        attemptCount: failedAttempts,
        reason: 'Multiple failed login attempts detected',
        metadata: {
          email,
          deviceInfo: req.get('user-agent'),
        },
      });
    } else {
      // Log standard failed login
      await logSecurityEvent(req, res, {
        module: 'AUTH',
        action: 'FAILED_LOGIN',
        riskLevel: 'MEDIUM',
        securityFlags: ['INVALID_CREDENTIALS'],
        userId: null,
        attemptCount: failedAttempts,
        reason: 'Invalid login credentials provided',
        metadata: {
          email,
        },
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  } catch (error) {
    await logError(req, res, {
      module: 'AUTH',
      action: 'Login Error',
      actionCategory: 'OTHER',
      entity: 'User',
      error,
      errorType: 'LOGIN_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 5: Log Successful Login (Activity Log)
 * ============================================================================
 */

async function loginSuccessExample(req, res) {
  try {
    // ... authentication successful ...
    const user = { _id: '123', email: 'user@example.com', role: 'CUSTOMER' };

    await logAction(req, res, {
      module: 'AUTH',
      action: 'User Login',
      actionCategory: 'LOGIN',
      entity: 'User',
      entityId: user._id,
      metadata: {
        email: user.email,
        role: user.role,
        loginTime: new Date().toISOString(),
      },
    });

    // Set user in request for logging
    req.user = user;

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    await logError(req, res, {
      module: 'AUTH',
      action: 'Login Error',
      actionCategory: 'LOGIN',
      entity: 'User',
      error,
      errorType: 'LOGIN_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 6: Log Logout
 * ============================================================================
 */

async function logoutExample(req, res) {
  try {
    await logAction(req, res, {
      module: 'AUTH',
      action: 'User Logout',
      actionCategory: 'LOGOUT',
      entity: 'User',
      entityId: req.user._id,
      metadata: {
        email: req.user.email,
        role: req.user.role,
        logoutTime: new Date().toISOString(),
      },
    });

    // ... clear session logic ...

    return res.status(200).json({ success: true });
  } catch (error) {
    await logError(req, res, {
      module: 'AUTH',
      action: 'Logout Error',
      actionCategory: 'LOGOUT',
      entity: 'User',
      error,
      errorType: 'LOGOUT_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 7: Log Payment Verification
 * ============================================================================
 */

async function verifyPaymentExample(req, res) {
  try {
    const { orderId } = req.body;
    const oldStatus = 'Pending Payment';
    const newStatus = 'Payment Verified';

    // ... payment verification logic ...

    await logAction(req, res, {
      module: 'PAYMENT',
      action: 'Payment Verified',
      actionCategory: 'VERIFICATION',
      entity: 'Order',
      entityId: orderId,
      changes: {
        before: { paymentStatus: oldStatus },
        after: { paymentStatus: newStatus },
      },
      reason: 'Payment successfully verified',
      metadata: {
        orderId,
        paymentMethod: 'Bank Transfer',
        amount: 50000,
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    await logError(req, res, {
      module: 'PAYMENT',
      action: 'Payment Verification Failed',
      actionCategory: 'VERIFICATION',
      entity: 'Order',
      error,
      errorType: 'PAYMENT_VERIFICATION_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 8: Log Quotation Approval
 * ============================================================================
 */

async function approveQuotationExample(req, res) {
  try {
    const { quotationId } = req.params;
    const quotationData = { status: 'Approved', approvedBy: req.user._id };

    await logAction(req, res, {
      module: 'CUSTOMER_SERVICE',
      action: 'Quotation Approved',
      actionCategory: 'APPROVAL',
      entity: 'Quotation',
      entityId: quotationId,
      changes: {
        before: { status: 'Pending' },
        after: { status: 'Approved' },
      },
      reason: 'Manager approved quotation',
      metadata: {
        quotationId,
        approvedBy: req.user.email,
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    await logError(req, res, {
      module: 'CUSTOMER_SERVICE',
      action: 'Quotation Approval Failed',
      actionCategory: 'APPROVAL',
      entity: 'Quotation',
      error,
      errorType: 'QUOTATION_APPROVAL_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 9: Log Role Change (Security-sensitive operation)
 * ============================================================================
 */

async function changeUserRoleExample(req, res) {
  try {
    const { userId } = req.params;
    const { newRole } = req.body;
    const oldRole = 'CUSTOMER'; // From database

    await logAction(req, res, {
      module: 'USER_MANAGEMENT',
      action: 'User Role Changed',
      actionCategory: 'UPDATE',
      entity: 'User',
      entityId: userId,
      changes: {
        before: { role: oldRole },
        after: { role: newRole },
      },
      reason: 'Super admin changed user role',
      metadata: {
        oldRole,
        newRole,
        changedBy: req.user.email,
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    await logError(req, res, {
      module: 'USER_MANAGEMENT',
      action: 'Role Change Failed',
      actionCategory: 'UPDATE',
      entity: 'User',
      error,
      errorType: 'ROLE_CHANGE_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 10: Log Ticket/Service Request Creation
 * ============================================================================
 */

async function createTicketExample(req, res) {
  try {
    const ticketData = {
      _id: '456',
      ticketRef: 'TKT001',
      subject: 'AC not cooling',
      priority: 'HIGH',
    };

    await logAction(req, res, {
      module: 'CUSTOMER_SERVICE',
      action: 'Service Request Created',
      actionCategory: 'CREATE',
      entity: 'ServiceRequest',
      entityId: ticketData._id,
      changes: {
        after: ticketData,
      },
      reason: 'Customer initiated service request',
      metadata: {
        ticketRef: ticketData.ticketRef,
        subject: ticketData.subject,
        priority: ticketData.priority,
      },
    });

    return res.status(201).json({ success: true, data: ticketData });
  } catch (error) {
    await logError(req, res, {
      module: 'CUSTOMER_SERVICE',
      action: 'Service Request Creation Failed',
      actionCategory: 'CREATE',
      entity: 'ServiceRequest',
      error,
      errorType: 'TICKET_CREATION_ERROR',
    });
    return res.status(500).json({ success: false });
  }
}

/**
 * ============================================================================
 * EXAMPLE 11: Log Unauthorized Access Attempts
 * ============================================================================
 */

async function unauthorizedAccessExample(req, res) {
  try {
    // Log unauthorized access attempt
    await logSecurityEvent(req, res, {
      module: 'USER_MANAGEMENT',
      action: 'UNAUTHORIZED_ATTEMPT',
      riskLevel: 'HIGH',
      securityFlags: ['PERMISSION_DENIED', 'UNAUTHORIZED_RESOURCE_ACCESS'],
      userId: req.user?._id,
      reason: 'User attempted to access restricted resource without permission',
      metadata: {
        requestedResource: req.originalUrl,
        userRole: req.user?.role,
        requiredRole: 'SUPER_ADMIN',
      },
    });

    return res.status(403).json({ success: false, message: 'Forbidden' });
  } catch (error) {
    console.error('Error logging unauthorized attempt:', error);
  }
}

/**
 * ============================================================================
 * EXAMPLE 12: Using LoggingService Directly (Advanced)
 * ============================================================================
 */

async function advancedLoggingExample() {
  // Log activity directly (without express request/response)
  await LoggingService.logActivity({
    userId: 'user123',
    userRole: 'MANAGER',
    module: 'FINANCE',
    action: 'Revenue Report Generated',
    actionCategory: 'CREATE',
    entity: 'Report',
    entityId: 'report456',
    changes: {
      after: {
        reportType: 'Monthly Revenue',
        period: 'January 2025',
      },
    },
    metadata: {
      reportFormat: 'PDF',
      recipients: 2,
    },
  });

  // Get filtered logs
  const logs = await LoggingService.getLogs({
    module: 'ORDER_MANAGEMENT',
    actionCategory: 'CREATE',
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    page: 1,
    limit: 50,
  });

  // Get statistics
  const stats = await LoggingService.getLogStatistics({
    module: 'AUTH',
  });
}

/**
 * ============================================================================
 * INTEGRATION CHECKLIST
 * ============================================================================
 *
 * To fully integrate logging throughout the system:
 *
 * ✅ 1. Import the logging helpers in your controllers:
 *       const { logAction, logError, logSecurityEvent } = require('../../middleware/action-logging');
 *
 * ✅ 2. Add logging to all significant user actions:
 *       - User creation, profile updates, photo uploads
 *       - Login, logout, failed login attempts
 *       - Order creation, updates, cancellations
 *       - Payment verification, rejections
 *       - Quotation approvals, rejections
 *       - Role changes, permission updates
 *       - Service request creation, status updates
 *       - Ticket assignments, updates
 *       - Report generation, exports
 *       - Configuration changes
 *       - Any admin actions
 *
 * ✅ 3. Use appropriate log types:
 *       - ACTIVITY: Normal user/system operations
 *       - ERROR: Exceptions and failed operations
 *       - SECURITY: Login attempts, unauthorized access, suspicious activity
 *
 * ✅ 4. Include relevant metadata for filtering:
 *       - Entity IDs
 *       - User roles
 *       - Before/after changes
 *       - Reason for action
 *       - Additional context
 *
 * ✅ 5. Test the logging endpoints:
 *       - GET /api/super-admin/logs (with filters)
 *       - GET /api/super-admin/logs/activity
 *       - GET /api/super-admin/logs/errors
 *       - GET /api/super-admin/logs/security
 *       - GET /api/super-admin/logs/analytics/dashboard
 *       - GET /api/super-admin/logs/export/csv
 *       - POST /api/super-admin/logs/cleanup
 *
 * ============================================================================
 * FILTERING CAPABILITIES
 * ============================================================================
 *
 * Logs can be filtered by:
 * 1. Log Type: ACTIVITY, ERROR, SECURITY
 * 2. Module: AUTH, USER_MANAGEMENT, ORDER_MANAGEMENT, etc.
 * 3. Action Category: CREATE, READ, UPDATE, DELETE, LOGIN, etc.
 * 4. User Role: SUPER_ADMIN, ADMIN, MANAGER, TECHNICIAN, CUSTOMER, etc.
 * 5. User (Performed By): Specific user ID
 * 6. Date Range: Start and end dates
 * 7. Status: SUCCESS, FAILED, PARTIAL
 *
 * ============================================================================
 * CSV EXPORT FORMAT
 * ============================================================================
 *
 * Exported CSV includes:
 * - Timestamp
 * - Log Type
 * - Module
 * - Action
 * - Action Category
 * - Performed By (email)
 * - User Role
 * - Entity
 * - Status
 * - Status Code
 * - IP Address
 * - Reason
 * - Error Type
 * - Error Message
 * - Security Risk Level
 * - Changes (JSON)
 *
 * ============================================================================
 */

module.exports = {
  createOrderExample,
  updateUserProfileExample,
  uploadPhotoExample,
  loginExample,
  loginSuccessExample,
  logoutExample,
  verifyPaymentExample,
  approveQuotationExample,
  changeUserRoleExample,
  createTicketExample,
  unauthorizedAccessExample,
  advancedLoggingExample,
};
