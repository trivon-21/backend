/**
 * Super Admin Logs Service
 * Handles log retrieval, filtering, analytics, and export
 */

const LoggingService = require('../../utils/logging-service');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');
const configCache = require('../../utils/config-cache');

class LogsService {
  /**
   * Get filtered logs
   */
  static async getFilteredLogs(filters = {}) {
    try {
      const {
        logType,
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        status,
        page = 1,
        limit = 50,
      } = filters;

      const result = await LoggingService.getLogs({
        logType,
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        status,
        page,
        limit,
      });

      return result;
    } catch (error) {
      console.error('[LogsService] Error fetching filtered logs:', error.message);
      throw error;
    }
  }

  /**
   * Get log details by ID
   */
  static async getLogById(logId) {
    try {
      const log = await AuditLog.findById(logId).populate(
        'performedBy',
        'fullName lastName email phoneNumber role'
      );

      if (!log) {
        throw new Error('Log not found');
      }

      return {
        success: true,
        data: log,
      };
    } catch (error) {
      console.error('[LogsService] Error fetching log:', error.message);
      throw error;
    }
  }

  /**
   * Get activity logs
   */
  static async getActivityLogs(filters = {}) {
    try {
      return await this.getFilteredLogs({
        logType: 'ACTIVITY',
        ...filters,
      });
    } catch (error) {
      console.error('[LogsService] Error fetching activity logs:', error.message);
      throw error;
    }
  }

  /**
   * Get error logs
   */
  static async getErrorLogs(filters = {}) {
    try {
      return await this.getFilteredLogs({
        logType: 'ERROR',
        ...filters,
      });
    } catch (error) {
      console.error('[LogsService] Error fetching error logs:', error.message);
      throw error;
    }
  }

  /**
   * Get security logs
   */
  static async getSecurityLogs(filters = {}) {
    try {
      return await this.getFilteredLogs({
        logType: 'SECURITY',
        ...filters,
      });
    } catch (error) {
      console.error('[LogsService] Error fetching security logs:', error.message);
      throw error;
    }
  }

  /**
   * Get logs by user
   */
  static async getLogsByUser(userId, filters = {}) {
    try {
      return await this.getFilteredLogs({
        performedBy: userId,
        ...filters,
      });
    } catch (error) {
      console.error('[LogsService] Error fetching user logs:', error.message);
      throw error;
    }
  }

  /**
   * Get logs by role
   */
  static async getLogsByRole(role, filters = {}) {
    try {
      return await this.getFilteredLogs({
        performedByRole: role,
        ...filters,
      });
    } catch (error) {
      console.error('[LogsService] Error fetching role logs:', error.message);
      throw error;
    }
  }

  /**
   * Get logs by module
   */
  static async getLogsByModule(module, filters = {}) {
    try {
      return await this.getFilteredLogs({
        module,
        ...filters,
      });
    } catch (error) {
      console.error('[LogsService] Error fetching module logs:', error.message);
      throw error;
    }
  }

  /**
   * Get dashboard analytics
   */
  static async getDashboardAnalytics(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await LoggingService.getLogStatistics({
        startDate,
      });

      // Get recent logs
      const recentLogs = await AuditLog.find({
        createdAt: { $gte: startDate },
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('performedBy', 'fullName lastName email phoneNumber role');

      // Get failed actions
      const failedActions = await AuditLog.find({
        status: 'FAILED',
        createdAt: { $gte: startDate },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('performedBy', 'fullName lastName email phoneNumber role');

      // Get critical security events
      const criticalSecurityEvents = await AuditLog.find({
        logType: 'SECURITY',
        'securityDetails.riskLevel': 'CRITICAL',
        createdAt: { $gte: startDate },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('performedBy', 'fullName lastName email phoneNumber role');

      // Get top error types
      const topErrors = await AuditLog.aggregate([
        {
          $match: {
            logType: 'ERROR',
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$errorDetails.errorType',
            count: { $sum: 1 },
            lastOccurred: { $max: '$createdAt' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]);

      return {
        success: true,
        analytics: {
          stats: stats.statistics,
          recentLogs,
          failedActions,
          criticalSecurityEvents,
          topErrors,
          dateRange: {
            start: startDate,
            end: new Date(),
            days,
          },
        },
      };
    } catch (error) {
      console.error('[LogsService] Error generating dashboard analytics:', error.message);
      throw error;
    }
  }

  /**
   * Get logs for export
   */
  static async getLogsForExport(filters = {}) {
    try {
      const {
        logType,
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        status,
      } = filters;

      const logs = await LoggingService.exportLogsData({
        logType,
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        status,
      });

      return {
        success: true,
        data: logs,
        count: logs.length,
      };
    } catch (error) {
      console.error('[LogsService] Error preparing export:', error.message);
      throw error;
    }
  }

  /**
   * Get available filter options
   */
  static async getFilterOptions() {
    try {
      // Return a small, curated set of filter options (keeps UI focused)
      const logTypes = ['ACTIVITY', 'ERROR', 'SECURITY'];
      const modules = [
        'auth',
        'customer',
        'order',
        'finance',
        'inventory-manager',
        'service-request',
        'system-config',
        'super-admin',
      ];
      const roles = ['SUPER_ADMIN', 'MANAGER', 'SERVICE_TEAM', 'CSA', 'TECHNICIAN', 'CUSTOMER', 'SYSTEM'];
      const actionCategories = ['CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'UPLOAD', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE'];
      const statuses = ['SUCCESS', 'FAILED'];

      return {
        success: true,
        options: {
          logTypes,
          modules,
          roles,
          actionCategories,
          statuses,
        },
      };
    } catch (error) {
      console.error('[LogsService] Error fetching filter options:', error.message);
      throw error;
    }
  }

  /**
   * Search logs by text
   */
  static async searchLogs(searchQuery, filters = {}) {
    try {
      const { page = 1, limit = 50 } = filters;
      const queryText = String(searchQuery || '').trim();
      const searchRegex = new RegExp(queryText, 'i');

      const matchedUsers = await User.find({
        $or: [
          { fullName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { phoneNumber: { $regex: searchRegex } },
          { role: { $regex: searchRegex } },
        ],
      })
        .select('_id')
        .lean();

      const matchedUserIds = matchedUsers.map((user) => user._id);

      // Build search query
      const mongoQuery = {
        $or: [
          { action: { $regex: searchRegex } },
          { entity: { $regex: searchRegex } },
          { performedByRole: { $regex: searchRegex } },
          { reason: { $regex: searchRegex } },
          { 'errorDetails.errorMessage': { $regex: searchRegex } },
          { 'metadata.loginIdentifier': { $regex: searchRegex } },
          { 'metadata.userEmail': { $regex: searchRegex } },
          { 'metadata.userName': { $regex: searchRegex } },
          { 'metadata.userPhone': { $regex: searchRegex } },
          { 'requestDetails.endpoint': { $regex: searchRegex } },
          ...(matchedUserIds.length > 0 ? [{ performedBy: { $in: matchedUserIds } }] : []),
        ],
      };

      // Apply additional filters
      if (filters.logType) mongoQuery.logType = filters.logType;
      if (filters.module) mongoQuery.module = filters.module;
      if (filters.actionCategory) mongoQuery.actionCategory = filters.actionCategory;
      if (filters.performedByRole) mongoQuery.performedByRole = filters.performedByRole;
      if (filters.status) mongoQuery.status = filters.status;
      if (filters.startDate || filters.endDate) {
        mongoQuery.createdAt = {};
        if (filters.startDate) mongoQuery.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) {
          const end = new Date(filters.endDate);
          end.setHours(23, 59, 59, 999);
          mongoQuery.createdAt.$lte = end;
        }
      }

      const skip = (page - 1) * limit;
      const total = await AuditLog.countDocuments(mongoQuery);
      const logs = await AuditLog.find(mongoQuery)
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
      console.error('[LogsService] Error searching logs:', error.message);
      throw error;
    }
  }

  /**
   * Get log retention policy
   */
  static async getRetentionPolicy() {
    try {
      const config = await configCache.getSystemConfig();
      const retentionDays = config?.logging?.logRetentionDays || 90;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const oldLogsCount = await AuditLog.countDocuments({
        createdAt: { $lt: cutoffDate },
      });

      return {
        success: true,
        policy: {
          retentionDays,
          cutoffDate,
          oldLogsCount,
        },
      };
    } catch (error) {
      console.error('[LogsService] Error fetching retention policy:', error.message);
      throw error;
    }
  }

  /**
   * Manually trigger log cleanup
   */
  static async cleanupOldLogs() {
    try {
      const config = await configCache.getSystemConfig();
      const retentionDays = config?.logging?.logRetentionDays || 90;

      const result = await LoggingService.deleteOldLogs(retentionDays);
      return result;
    } catch (error) {
      console.error('[LogsService] Error cleaning up old logs:', error.message);
      throw error;
    }
  }
}

module.exports = LogsService;
