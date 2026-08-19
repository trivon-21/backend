const systemConfigService = require('./system-config.service');

class SystemConfigController {
  /**
   * GET /api/super-admin/system-config
   * Get current system configuration
   */
  async getSystemConfig(req, res) {
    try {
      const config = await systemConfigService.getSystemConfig();
      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (error) {
      console.error('Error getting system config:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get system configuration',
      });
    }
  }

  /**
   * PUT /api/super-admin/system-config/business-rules
   * Update business rules
   */
  async updateBusinessRules(req, res) {
    try {
      const { businessRules, reason } = req.body;

      if (!businessRules || typeof businessRules !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'businessRules object is required',
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');
      const performedByRole = req.user.role || 'UNKNOWN';

      const config = await systemConfigService.updateBusinessRules(
        businessRules,
        req.user._id,
        reason,
        ipAddress,
        userAgent,
        performedByRole
      );

      res.status(200).json({
        success: true,
        message: 'Business rules updated successfully',
        data: config,
      });
    } catch (error) {
      console.error('Error updating business rules:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update business rules',
      });
    }
  }

  /**
   * PUT /api/super-admin/system-config/feature-flags
   * Update feature flags
   */
  async updateFeatureFlags(req, res) {
    try {
      const { featureFlags, reason } = req.body;

      if (!featureFlags || typeof featureFlags !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'featureFlags object is required',
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');
      const performedByRole = req.user.role || 'UNKNOWN';

      const config = await systemConfigService.updateFeatureFlags(
        featureFlags,
        req.user._id,
        reason,
        ipAddress,
        userAgent,
        performedByRole
      );

      res.status(200).json({
        success: true,
        message: 'Feature flags updated successfully',
        data: config,
      });
    } catch (error) {
      console.error('Error updating feature flags:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update feature flags',
      });
    }
  }

  /**
   * PUT /api/super-admin/system-config/maintenance
   * Update maintenance settings
   */
  async updateMaintenanceMode(req, res) {
    try {
      const { maintenance, reason } = req.body;

      if (!maintenance || typeof maintenance !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'maintenance object is required',
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');
      const performedByRole = req.user.role || 'UNKNOWN';

      const config = await systemConfigService.updateMaintenanceMode(
        maintenance,
        req.user._id,
        reason,
        ipAddress,
        userAgent,
        performedByRole
      );

      res.status(200).json({
        success: true,
        message: 'Maintenance updated successfully',
        data: config,
      });
    } catch (error) {
      console.error('Error updating maintenance:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update maintenance',
      });
    }
  }

  /**
   * PUT /api/super-admin/system-config/system-info
   * Update system info
   */
  async updateSystemInfo(req, res) {
    try {
      const { systemInfo, reason } = req.body;

      if (!systemInfo || typeof systemInfo !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'systemInfo object is required',
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');
      const performedByRole = req.user.role || 'UNKNOWN';

      const config = await systemConfigService.updateSystemInfo(
        systemInfo,
        req.user._id,
        reason,
        ipAddress,
        userAgent,
        performedByRole
      );

      res.status(200).json({
        success: true,
        message: 'System info updated successfully',
        data: config,
      });
    } catch (error) {
      console.error('Error updating system info:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update system info',
      });
    }
  }

  /**
   * PUT /api/super-admin/system-config/logging
   * Update logging settings (retention days, enable flags, log level)
   */
  async updateLoggingSettings(req, res) {
    try {
      const { logging, reason } = req.body;

      if (!logging || typeof logging !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'logging object is required',
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('user-agent');
      const performedByRole = req.user.role || 'UNKNOWN';

      const config = await systemConfigService.updateLoggingSettings(
        logging,
        req.user._id,
        reason,
        ipAddress,
        userAgent,
        performedByRole
      );

      res.status(200).json({
        success: true,
        message: 'Logging settings updated successfully',
        data: config,
      });
    } catch (error) {
      console.error('Error updating logging settings:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update logging settings',
      });
    }
  }

  /**
   * GET /api/super-admin/system-config/audit-logs
   * Get audit logs for system configuration changes
   */
  async getAuditLogs(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const filters = {};

      if (req.query.action) {
        filters.action = req.query.action;
      }

      if (req.query.performedBy) {
        filters.performedBy = req.query.performedBy;
      }

      const result = await systemConfigService.getAuditLogs(filters, page, limit);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error getting audit logs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get audit logs',
      });
    }
  }
}

module.exports = new SystemConfigController();
