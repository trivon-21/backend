/**
 * Centralized Logging Service
 * Handles all system logging: Activity, Error, and Security logs
 */

const AuditLog = require('../models/AuditLog');
const configCache = require('./config-cache');

class LoggingService {
  static SENSITIVE_FIELDS = [
    'password',
    'passwordhash',
    'token',
    'accesstoken',
    'refreshtoken',
    'authorization',
    'secret',
    'otp',
    'pin',
  ];

  static inferModuleFromEndpoint(endpoint = '') {
    const path = String(endpoint || '').toLowerCase();

    if (path.includes('/auth')) return 'AUTH';
    if (path.includes('/super-admin/system-config')) return 'SYSTEM_CONFIG';
    if (path.includes('/super-admin/users')) return 'USER_MANAGEMENT';
    if (path.includes('/super-admin/logs')) return 'AUDIT';
    if (path.includes('/customer/order') || path.includes('/orders')) return 'ORDER_MANAGEMENT';
    if (path.includes('/payment')) return 'PAYMENT';
    if (path.includes('/finance')) return 'FINANCE';
    if (path.includes('/inventory')) return 'INVENTORY';
    if (path.includes('/inspection')) return 'INSPECTION';
    if (path.includes('/service-team')) return 'SERVICE_TEAM';
    if (path.includes('/technician')) return 'TECHNICIAN';
    if (path.includes('/sales')) return 'SALES';
    if (path.includes('/dashboard')) return 'DASHBOARD';
    if (path.includes('/report')) return 'REPORTS';
    if (path.includes('/profile') || path.includes('/user')) return 'USER_MANAGEMENT';
    if (path.includes('/feedback') || path.includes('/inquiry') || path.includes('/csa')) return 'CUSTOMER_SERVICE';

    return 'OTHER';
  }

  static inferActionCategory(method = 'GET', endpoint = '') {
    const lowerMethod = String(method || 'GET').toUpperCase();
    const path = String(endpoint || '').toLowerCase();

    if (path.includes('export') || path.includes('download')) return 'EXPORT';

    if (lowerMethod === 'GET') return 'READ';
    if (lowerMethod === 'POST') {
      if (path.includes('login')) return 'LOGIN';
      if (path.includes('logout')) return 'LOGOUT';
      if (path.includes('export')) return 'EXPORT';
      if (path.includes('import')) return 'IMPORT';
      return 'CREATE';
    }
    if (lowerMethod === 'PUT' || lowerMethod === 'PATCH') return 'UPDATE';
    if (lowerMethod === 'DELETE') return 'DELETE';

    return 'OTHER';
  }

  /**
   * Human-friendly action name for common endpoints
   * Falls back to `METHOD endpoint` when unknown
   */
  static humanizeAction(method = 'GET', endpoint = '') {
    const m = String(method || '').toUpperCase();
    const path = String(endpoint || '').toLowerCase();

    // Helper to detect path segments without IDs
    const cleaned = path
      .replace(/\/[0-9a-f]{24}(?=\/|$)/g, '/:id')
      .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
      // Replace long token/hash-like segments (e.g. password reset token)
      .replace(/\/[a-z0-9_-]{32,}(?=\/|$)/g, '/:token');

    const routes = [
      { test: (p) => p.includes('/api/customer/profile/photo'), map: { DELETE: 'Delete Profile Photo', POST: 'Upload Profile Photo', PUT: 'Update Profile Photo', GET: 'View Profile Photo' } },
      { test: (p) => p.includes('/api/customer/profile'), map: { PUT: 'Update Profile', GET: 'View Profile', POST: 'Create Profile', DELETE: 'Delete Profile' } },
      { test: (p) => p.includes('/api/auth/login'), name: 'Login' },
      { test: (p) => p.includes('/api/auth/signup'), name: 'Signup' },
      { test: (p) => p.includes('/api/auth/logout'), name: 'Logout' },
      { test: (p) => p.includes('/api/auth/forgot-password'), name: 'Forgot Password Request' },
      { test: (p) => p.includes('/api/auth/reset-password'), name: 'Reset Password' },
      { test: (p) => p.includes('/api/order') || p.includes('/orders'), map: { POST: 'Create Order', GET: 'Get Orders', PUT: 'Update Order', DELETE: 'Delete Order' } },
      { test: (p) => p.includes('/api/service-request'), map: { POST: 'Create Service Request', GET: 'Get Service Requests', PUT: 'Update Service Request', DELETE: 'Delete Service Request' } },
      { test: (p) => p.includes('/api/feedback'), map: { POST: 'Submit Feedback', GET: 'Get Feedback' } },
    ];

    for (const route of routes) {
      try {
        if (route.test(cleaned)) {
          if (route.map && route.map[m]) return route.map[m];
          if (route.name) return route.name;
        }
      } catch (e) {
        // ignore and continue
      }
    }

    // Generic CRUD friendly naming when possible
    if (m === 'POST') return `Create ${cleaned}`;
    if (m === 'PUT' || m === 'PATCH') return `Update ${cleaned}`;
    if (m === 'DELETE') return `Delete ${cleaned}`;
    if (m === 'GET') return `Get ${cleaned}`;

    return `${m} ${endpoint}`;
  }

  static redactAndTrimPayload(value, key = '', depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 3) return '[MAX_DEPTH_REACHED]';

    const normalizedKey = String(key || '').toLowerCase();
    if (this.SENSITIVE_FIELDS.some((field) => normalizedKey.includes(field))) {
      return '[REDACTED]';
    }

    if (typeof value === 'string') {
      if (value.startsWith('data:image/')) {
        return `[IMAGE_BASE64 length=${value.length}]`;
      }

      if (value.length > 600) {
        return `${value.slice(0, 600)}...[TRUNCATED length=${value.length}]`;
      }

      return value;
    }

    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => this.redactAndTrimPayload(item, key, depth + 1));
    }

    if (typeof value === 'object') {
      const out = {};
      Object.entries(value).slice(0, 50).forEach(([k, v]) => {
        out[k] = this.redactAndTrimPayload(v, k, depth + 1);
      });
      return out;
    }

    return value;
  }

  static summarizeUploadMetadata(req) {
    const summary = [];
    const body = req?.body || {};

    Object.entries(body).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      const looksLikeUploadKey = ['photo', 'image', 'file', 'upload', 'slip'].some((tag) => lowerKey.includes(tag));
      const looksLikeImageData = typeof value === 'string' && value.startsWith('data:image/');

      if (looksLikeUploadKey || looksLikeImageData) {
        summary.push({
          field: key,
          type: looksLikeImageData ? 'BASE64_IMAGE' : 'UPLOAD_FIELD',
          size: typeof value === 'string' ? value.length : null,
        });
      }
    });

    return summary;
  }

  /**
   * Log an activity
   * @param {Object} options - Activity log options
   * @param {string} options.userId - User who performed the action
   * @param {string} options.userRole - User's role
   * @param {string} options.module - Module name (AUTH, ORDER_MANAGEMENT, etc.)
   * @param {string} options.action - Specific action name
   * @param {string} options.actionCategory - Category of action (CREATE, UPDATE, DELETE, etc.)
   * @param {string} options.entity - Entity type (User, Order, etc.)
   * @param {string} options.entityId - ID of the entity
   * @param {Object} options.changes - Before/after changes
   * @param {string} options.reason - Optional reason for the action
   * @param {Object} options.metadata - Additional metadata
   * @param {Object} options.request - Express request object for IP and User-Agent
   * @returns {Promise<Object>} - Created audit log document
   */
  static async logActivity({
    userId,
    userRole,
    module,
    action,
    actionCategory,
    entity,
    entityId = null,
    changes = {},
    reason = null,
    metadata = {},
    request = null,
    status = 'SUCCESS',
    statusCode = null,
  }) {
    try {
      // Check if logging is enabled in system config
      const config = await configCache.getSystemConfig();
      if (!config?.logging?.enableActivityLogs) {
        console.log('[LoggingService] Activity logs disabled in system config');
        return null;
      }

      const logEntry = new AuditLog({
        performedBy: userId,
        performedByRole: userRole,
        logType: 'ACTIVITY',
        logLevel: 'INFO',
        module,
        action,
        actionCategory,
        entity,
        entityId,
        changes,
        reason,
        metadata,
        ipAddress: request?.ip || request?.connection?.remoteAddress || null,
        userAgent: request?.get('user-agent') || null,
        status,
        statusCode,
        requestDetails: {
          method: request?.method || null,
          endpoint: request?.originalUrl || null,
          params: request?.body ? this.redactAndTrimPayload(request.body) : null,
        },
      });

      const savedLog = await logEntry.save();
      console.log(`[LoggingService] Activity logged: ${action} by ${userRole}`);
      return savedLog;
    } catch (error) {
      console.error('[LoggingService] Error logging activity:', error.message);
      // Don't throw - logging shouldn't break the application
      return null;
    }
  }

  /**
   * Log an error
   * @param {Object} options - Error log options
   * @param {string} options.userId - User who triggered the error (optional)
   * @param {string} options.userRole - User's role (optional)
   * @param {string} options.module - Module name
   * @param {string} options.action - Action that caused the error
   * @param {string} options.actionCategory - Category of action
   * @param {string} options.entity - Entity type affected
   * @param {Error} options.error - The error object
   * @param {string} options.errorType - Type of error
   * @param {Object} options.metadata - Additional metadata
   * @param {Object} options.request - Express request object
   * @returns {Promise<Object>} - Created error log
   */
  static async logError({
    userId = null,
    userRole = 'SYSTEM',
    module,
    action,
    actionCategory = 'OTHER',
    entity = 'SYSTEM',
    error,
    errorType = 'APPLICATION_ERROR',
    metadata = {},
    request = null,
  }) {
    try {
      const config = await configCache.getSystemConfig();
      if (!config?.logging?.enableErrorLogs) {
        console.error('[LoggingService] Error logs disabled');
        return null;
      }

      const logEntry = new AuditLog({
        performedBy: userId,
        performedByRole: userRole,
        logType: 'ERROR',
        logLevel: 'ERROR',
        module,
        action,
        actionCategory,
        entity,
        entityId: null,
        ipAddress: request?.ip || request?.connection?.remoteAddress || null,
        userAgent: request?.get('user-agent') || null,
        status: 'FAILED',
        statusCode: request?.statusCode || 500,
        errorDetails: {
          errorType,
          errorMessage: error?.message || 'Unknown error',
          stackTrace: error?.stack || null,
          affectedResource: metadata?.affectedResource || null,
        },
        metadata,
        requestDetails: {
          method: request?.method || null,
          endpoint: request?.originalUrl || null,
        },
      });

      const savedLog = await logEntry.save();
      console.error(`[LoggingService] Error logged: ${errorType} - ${error?.message}`);
      return savedLog;
    } catch (logError) {
      console.error('[LoggingService] Error logging error:', logError.message);
      return null;
    }
  }

  /**
   * Log a security event
   * @param {Object} options - Security log options
   * @param {string} options.userId - User involved in security event
   * @param {string} options.userRole - User's role
   * @param {string} options.module - Module (AUTH, etc.)
   * @param {string} options.action - Security action (FAILED_LOGIN, UNAUTHORIZED_ATTEMPT, etc.)
   * @param {string} options.riskLevel - Risk level (LOW, MEDIUM, HIGH, CRITICAL)
   * @param {string[]} options.securityFlags - Security flags/warnings
   * @param {number} options.attemptCount - Number of attempts (for login attempts)
   * @param {string} options.reason - Reason for the security event
   * @param {Object} options.metadata - Additional metadata
   * @param {Object} options.request - Express request object
   * @returns {Promise<Object>} - Created security log
   */
  static async logSecurityEvent({
    userId,
    userRole = 'UNKNOWN',
    module = 'AUTH',
    action,
    riskLevel = 'MEDIUM',
    securityFlags = [],
    attemptCount = null,
    reason = null,
    metadata = {},
    request = null,
  }) {
    try {
      const config = await configCache.getSystemConfig();
      if (!config?.logging?.enableSecurityLogs) {
        console.warn('[LoggingService] Security logs disabled');
        return null;
      }

      const logLevel =
        riskLevel === 'CRITICAL'
          ? 'CRITICAL'
          : riskLevel === 'HIGH'
            ? 'WARNING'
            : 'ERROR';

      const logEntry = new AuditLog({
        performedBy: userId,
        performedByRole: userRole,
        logType: 'SECURITY',
        logLevel,
        module,
        action,
        actionCategory: action.includes('UNAUTHORIZED') ? 'UNAUTHORIZED_ATTEMPT' : 'SUSPICIOUS_ACTIVITY',
        entity: 'USER',
        entityId: userId,
        reason,
        metadata,
        ipAddress: request?.ip || request?.connection?.remoteAddress || null,
        userAgent: request?.get('user-agent') || null,
        status: 'FAILED',
        statusCode: request?.statusCode || 401,
        securityDetails: {
          attemptCount,
          riskLevel,
          securityFlags,
        },
        requestDetails: {
          method: request?.method || null,
          endpoint: request?.originalUrl || null,
          params: request?.body ? { email: request.body.email, ...metadata } : null,
        },
      });

      const savedLog = await logEntry.save();
      console.warn(`[LoggingService] Security event logged: ${action} - Risk: ${riskLevel}`);
      return savedLog;
    } catch (error) {
      console.error('[LoggingService] Error logging security event:', error.message);
      return null;
    }
  }

  /**
   * Get logs with filtering
   * @param {Object} filters - Filter criteria
   * @param {string} filters.logType - ACTIVITY, ERROR, SECURITY
   * @param {string} filters.module - Module name
   * @param {string} filters.actionCategory - Action category
   * @param {string} filters.performedByRole - User role
   * @param {string} filters.performedBy - User ID
   * @param {Date} filters.startDate - Start date
   * @param {Date} filters.endDate - End date
   * @param {string} filters.status - SUCCESS, FAILED, PARTIAL
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Records per page
   * @returns {Promise<Object>} - Paginated logs
   */
  static async getLogs({
    logType = null,
    module = null,
    actionCategory = null,
    performedByRole = null,
    performedBy = null,
    startDate = null,
    endDate = null,
    status = null,
    page = 1,
    limit = 50,
  }) {
    try {
      const query = {};

      if (logType) query.logType = logType;
      if (module) query.module = module;
      if (actionCategory) query.actionCategory = actionCategory;
      if (performedByRole) query.performedByRole = performedByRole;
      if (performedBy) query.performedBy = performedBy;
      if (status) query.status = status;

      // Date range filtering
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      const skip = (page - 1) * limit;
      const total = await AuditLog.countDocuments(query);
      const logs = await AuditLog.find(query)
        .populate('performedBy', 'fullName lastName email phoneNumber role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return {
        success: true,
        data: logs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('[LoggingService] Error fetching logs:', error.message);
      throw error;
    }
  }

  /**
   * Get log statistics
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Object>} - Log statistics
   */
  static async getLogStatistics({
    startDate = null,
    endDate = null,
    module = null,
  } = {}) {
    try {
      const query = {};

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      if (module) query.module = module;

      const stats = await AuditLog.aggregate([
        { $match: query },
        {
          $facet: {
            byLogType: [
              { $group: { _id: '$logType', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            byModule: [
              { $group: { _id: '$module', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            byRole: [
              { $group: { _id: '$performedByRole', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            byActionCategory: [
              { $group: { _id: '$actionCategory', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            errorsSummary: [
              { $match: { logType: 'ERROR' } },
              { $group: { _id: '$errorDetails.errorType', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ],
            securityEventsCount: [
              { $match: { logType: 'SECURITY' } },
              { $group: { _id: '$securityDetails.riskLevel', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            totalLogs: [
              { $group: { _id: null, count: { $sum: 1 } } },
            ],
          },
        },
      ]);

      return {
        success: true,
        statistics: stats[0],
      };
    } catch (error) {
      console.error('[LoggingService] Error getting log statistics:', error.message);
      throw error;
    }
  }

  /**
   * Delete logs older than retention days
   * @param {number} retentionDays - Number of days to retain
   * @returns {Promise<Object>} - Deletion result
   */
  static async deleteOldLogs(retentionDays) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await AuditLog.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      console.log(`[LoggingService] Deleted ${result.deletedCount} logs older than ${retentionDays} days`);

      return {
        success: true,
        deletedCount: result.deletedCount,
        cutoffDate,
      };
    } catch (error) {
      console.error('[LoggingService] Error deleting old logs:', error.message);
      throw error;
    }
  }

  /**
   * Export logs to raw data (used by CSV export)
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Array>} - Array of logs
   */
  static async exportLogsData({
    logType = null,
    module = null,
    actionCategory = null,
    performedByRole = null,
    performedBy = null,
    startDate = null,
    endDate = null,
    status = null,
  }) {
    try {
      const query = {};

      if (logType) query.logType = logType;
      if (module) query.module = module;
      if (actionCategory) query.actionCategory = actionCategory;
      if (performedByRole) query.performedByRole = performedByRole;
      if (performedBy) query.performedBy = performedBy;
      if (status) query.status = status;

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      const logs = await AuditLog.find(query)
        .populate('performedBy', 'fullName lastName email phoneNumber role')
        .sort({ createdAt: -1 })
        .lean();

      return logs;
    } catch (error) {
      console.error('[LoggingService] Error exporting logs:', error.message);
      throw error;
    }
  }
}

module.exports = LoggingService;
