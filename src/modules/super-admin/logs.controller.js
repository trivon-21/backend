/**
 * Super Admin Logs Controller
 * Handles all log management endpoints for super admin dashboard
 */

const LogsService = require('./logs.service');
const { Parser } = require('json2csv');

class LogsController {
  /**
   * Get filtered logs
   * GET /api/super-admin/logs
   */
  static async getLogs(req, res) {
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
      } = req.query;

      const result = await LogsService.getFilteredLogs({
        logType,
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        status,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[LogsController] Error fetching logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching logs',
        error: error.message,
      });
    }
  }

  /**
   * Get log details by ID
   * GET /api/super-admin/logs/:id
   */
  static async getLogById(req, res) {
    try {
      const { id } = req.params;
      const result = await LogsService.getLogById(id);

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LogsController] Error fetching log:', error.message);
      return res.status(404).json({
        success: false,
        message: 'Log not found',
        error: error.message,
      });
    }
  }

  /**
   * Get activity logs
   * GET /api/super-admin/logs/activity
   */
  static async getActivityLogs(req, res) {
    try {
      const {
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        page = 1,
        limit = 50,
      } = req.query;

      const result = await LogsService.getActivityLogs({
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[LogsController] Error fetching activity logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching activity logs',
        error: error.message,
      });
    }
  }

  /**
   * Get error logs
   * GET /api/super-admin/logs/errors
   */
  static async getErrorLogs(req, res) {
    try {
      const {
        module,
        startDate,
        endDate,
        page = 1,
        limit = 50,
      } = req.query;

      const result = await LogsService.getErrorLogs({
        module,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[LogsController] Error fetching error logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching error logs',
        error: error.message,
      });
    }
  }

  /**
   * Get security logs
   * GET /api/super-admin/logs/security
   */
  static async getSecurityLogs(req, res) {
    try {
      const {
        performedByRole,
        performedBy,
        startDate,
        endDate,
        page = 1,
        limit = 50,
      } = req.query;

      const result = await LogsService.getSecurityLogs({
        performedByRole,
        performedBy,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[LogsController] Error fetching security logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching security logs',
        error: error.message,
      });
    }
  }

  /**
   * Get dashboard analytics
   * GET /api/super-admin/logs/analytics/dashboard
   */
  static async getDashboardAnalytics(req, res) {
    try {
      const { days = 30 } = req.query;

      const result = await LogsService.getDashboardAnalytics(parseInt(days));

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LogsController] Error fetching analytics:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching analytics',
        error: error.message,
      });
    }
  }

  /**
   * Get filter options for logs
   * GET /api/super-admin/logs/filters/options
   */
  static async getFilterOptions(req, res) {
    try {
      const result = await LogsService.getFilterOptions();

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LogsController] Error fetching filter options:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching filter options',
        error: error.message,
      });
    }
  }

  /**
   * Search logs
   * GET /api/super-admin/logs/search
   */
  static async searchLogs(req, res) {
    try {
      const {
        query,
        logType,
        module,
        actionCategory,
        performedByRole,
        status,
        startDate,
        endDate,
        page = 1,
        limit = 50,
      } = req.query;

      if (!query || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }

      const result = await LogsService.searchLogs(query, {
        logType,
        module,
        actionCategory,
        performedByRole,
        status,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LogsController] Error searching logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error searching logs',
        error: error.message,
      });
    }
  }

  /**
   * Export logs as CSV
   * GET /api/super-admin/logs/export/csv
   */
  static async exportLogsCSV(req, res) {
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
      } = req.query;

      const result = await LogsService.getLogsForExport({
        logType,
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        status,
      });

      // Transform logs for CSV
      const csv_data = (result.data || []).map((log) => ({
        'Timestamp': new Date(log.createdAt).toISOString(),
        'Log Type': log.logType,
        'Module': log.module,
        'Action': log.action,
        'Action Category': log.actionCategory,
        'Performed By': log.performedBy?.email || log.performedBy || 'SYSTEM',
        'User Role': log.performedByRole,
        'Entity': log.entity,
        'Status': log.status,
        'Status Code': log.statusCode || '-',
        'IP Address': log.ipAddress || '-',
        'Reason': log.reason || '-',
        'Error Type': log.errorDetails?.errorType || '-',
        'Error Message': log.errorDetails?.errorMessage || '-',
        'Security Risk Level': log.securityDetails?.riskLevel || '-',
        'Changes': JSON.stringify(log.changes) || '-',
      }));

      const csvFields = [
        'Timestamp',
        'Log Type',
        'Module',
        'Action',
        'Action Category',
        'Performed By',
        'User Role',
        'Entity',
        'Status',
        'Status Code',
        'IP Address',
        'Reason',
        'Error Type',
        'Error Message',
        'Security Risk Level',
        'Changes',
      ];

      try {
        const parser = new Parser({ fields: csvFields });
        const csv = parser.parse(csv_data);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="audit-logs-${Date.now()}.csv"`
        );
        res.send(csv);
      } catch (parseError) {
        console.error('[LogsController] CSV parsing error:', parseError.message);
        return res.status(500).json({
          success: false,
          message: 'Error generating CSV',
          error: parseError.message,
        });
      }
    } catch (error) {
      console.error('[LogsController] Error exporting logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error exporting logs',
        error: error.message,
      });
    }
  }

  /**
   * Export logs as JSON
   * GET /api/super-admin/logs/export/json
   */
  static async exportLogsJSON(req, res) {
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
      } = req.query;

      const result = await LogsService.getLogsForExport({
        logType,
        module,
        actionCategory,
        performedByRole,
        performedBy,
        startDate,
        endDate,
        status,
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="audit-logs-${Date.now()}.json"`
      );
      res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        count: result.data.length,
        data: result.data,
      });
    } catch (error) {
      console.error('[LogsController] Error exporting logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error exporting logs',
        error: error.message,
      });
    }
  }

  /**
   * Get log retention policy
   * GET /api/super-admin/logs/retention/policy
   */
  static async getRetentionPolicy(req, res) {
    try {
      const result = await LogsService.getRetentionPolicy();

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LogsController] Error fetching retention policy:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching retention policy',
        error: error.message,
      });
    }
  }

  /**
   * Manually cleanup old logs
   * POST /api/super-admin/logs/cleanup
   */
  static async cleanupOldLogs(req, res) {
    try {
      const result = await LogsService.cleanupOldLogs();

      return res.status(200).json({
        success: true,
        message: 'Log cleanup completed',
        ...result,
      });
    } catch (error) {
      console.error('[LogsController] Error cleaning up logs:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error cleaning up logs',
        error: error.message,
      });
    }
  }

  /**
   * Get user activity timeline
   * GET /api/super-admin/logs/user/:userId
   */
  static async getUserActivityTimeline(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 100 } = req.query;

      const result = await LogsService.getLogsByUser(userId, {
        limit: parseInt(limit),
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LogsController] Error fetching user timeline:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching user timeline',
        error: error.message,
      });
    }
  }

  /**
   * Get role activity summary
   * GET /api/super-admin/logs/role/:role
   */
  static async getRoleActivitySummary(req, res) {
    try {
      const { role } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const result = await LogsService.getLogsByRole(role, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error('[LogsController] Error fetching role activity:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error fetching role activity',
        error: error.message,
      });
    }
  }
}

module.exports = LogsController;
