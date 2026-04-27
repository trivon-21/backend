const SystemConfig = require('../../../models/SystemConfig');
const AuditLog = require('../../../models/AuditLog');
const { clearCache } = require('../../../utils/config-cache');

class SystemConfigService {
  /**
   * Get current system configuration
   */
  async getSystemConfig() {
    let config = await SystemConfig.findOne().populate('updatedBy', 'fullName email');

    if (!config) {
      // Create default config if it doesn't exist
      config = await SystemConfig.create({});
      config = await config.populate('updatedBy', 'fullName email');
    }

    return config;
  }

  /**
   * Update business rules
   */
  async updateBusinessRules(updates, performedBy, reason, ipAddress, userAgent) {
    const config = await this.getSystemConfig();

    // Store old values for audit trail
    const oldValues = { ...config.businessRules.toObject() };
    const changes = {};

    // Validate and update each field
    for (const [key, value] of Object.entries(updates)) {
      if (!config.businessRules.hasOwnProperty(key)) {
        throw new Error(`Invalid business rule field: ${key}`);
      }

      // Validation
      if (key === 'quotationApprovalThreshold') {
        if (value < 0 || value > 10000000) {
          throw new Error('Quotation approval threshold must be between 0 and 10,000,000');
        }
      } else if (key === 'paymentAutoCancelDays') {
        if (value < 1 || value > 365) {
          throw new Error('Payment auto-cancel days must be between 1 and 365');
        }
      } else if (key === 'defaultWarrantyMonths') {
        if (value < 1 || value > 60) {
          throw new Error('Default warranty months must be between 1 and 60');
        }
      } else if (key === 'amcContractMonths') {
        if (value < 1 || value > 60) {
          throw new Error('AMC contract months must be between 1 and 60');
        }
      } else if (key === 'maxRescheduleAttempts') {
        if (value < 1 || value > 10) {
          throw new Error('Max reschedule attempts must be between 1 and 10');
        }
      }

      if (oldValues[key] !== value) {
        changes[key] = {
          oldValue: oldValues[key],
          newValue: value,
        };
        config.businessRules[key] = value;
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error('No changes made to business rules');
    }

    config.updatedBy = performedBy;
    await config.save();

    // Log the change
    await this._createAuditLog(
      'UPDATE_BUSINESS_RULES',
      changes,
      config._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    // Clear cache
    clearCache();

    return config.populate('updatedBy', 'fullName email');
  }

  /**
   * Update feature flags
   */
  async updateFeatureFlags(updates, performedBy, reason, ipAddress, userAgent) {
    const config = await this.getSystemConfig();
    const oldValues = { ...config.featureFlags.toObject() };
    const changes = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!config.featureFlags.hasOwnProperty(key)) {
        throw new Error(`Invalid feature flag: ${key}`);
      }

      if (typeof value !== 'boolean') {
        throw new Error(`Feature flag value must be boolean`);
      }

      if (oldValues[key] !== value) {
        changes[key] = {
          oldValue: oldValues[key],
          newValue: value,
        };
        config.featureFlags[key] = value;
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error('No changes made to feature flags');
    }

    config.updatedBy = performedBy;
    await config.save();

    await this._createAuditLog(
      'UPDATE_FEATURE_FLAGS',
      changes,
      config._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    // Clear cache
    clearCache();

    return config.populate('updatedBy', 'fullName email');
  }

  /**
   * Update maintenance settings
   */
  async updateMaintenanceMode(updates, performedBy, reason, ipAddress, userAgent) {
    const config = await this.getSystemConfig();
    const oldValues = {
      isActive: config.maintenance.isActive,
      message: config.maintenance.message,
      maintenanceReason: config.maintenance.reason,
      startTime: config.maintenance.startTime,
      endTime: config.maintenance.endTime,
    };

    const changes = {};

    if (updates.hasOwnProperty('isActive')) {
      if (typeof updates.isActive !== 'boolean') {
        throw new Error('isActive must be boolean');
      }
      if (oldValues.isActive !== updates.isActive) {
        changes.isActive = {
          oldValue: oldValues.isActive,
          newValue: updates.isActive,
        };
        config.maintenance.isActive = updates.isActive;
      }
    }

    if (updates.hasOwnProperty('message')) {
      if (oldValues.message !== updates.message) {
        changes.message = {
          oldValue: oldValues.message,
          newValue: updates.message,
        };
        config.maintenance.message = updates.message;
      }
    }

    if (updates.hasOwnProperty('reason')) {
      if (oldValues.maintenanceReason !== updates.reason) {
        changes.maintenanceReason = {
          oldValue: oldValues.maintenanceReason,
          newValue: updates.reason,
        };
        config.maintenance.reason = updates.reason;
      }
    }

    if (updates.hasOwnProperty('scheduledStartTime')) {
      const newStart = updates.scheduledStartTime ? new Date(updates.scheduledStartTime) : null;
      if (newStart && isNaN(newStart.getTime())) {
        throw new Error('Invalid scheduledStartTime');
      }

      const currentStart = config.maintenance.scheduledStartTime;
      if ((currentStart?.getTime() || null) !== (newStart?.getTime() || null)) {
        changes.scheduledStartTime = {
          oldValue: currentStart,
          newValue: newStart,
        };
        config.maintenance.scheduledStartTime = newStart;
      }
    }

    if (updates.hasOwnProperty('scheduledEndTime')) {
      const newEnd = updates.scheduledEndTime ? new Date(updates.scheduledEndTime) : null;
      if (newEnd && isNaN(newEnd.getTime())) {
        throw new Error('Invalid scheduledEndTime');
      }

      const currentEnd = config.maintenance.scheduledEndTime;
      if ((currentEnd?.getTime() || null) !== (newEnd?.getTime() || null)) {
        changes.scheduledEndTime = {
          oldValue: currentEnd,
          newValue: newEnd,
        };
        config.maintenance.scheduledEndTime = newEnd;
      }
    }

    // Validate that start is before end if both are set
    if (config.maintenance.scheduledStartTime && config.maintenance.scheduledEndTime) {
      if (config.maintenance.scheduledStartTime >= config.maintenance.scheduledEndTime) {
        throw new Error('Scheduled start time must be before end time');
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error('No changes made to maintenance');
    }

    config.updatedBy = performedBy;
    await config.save();

    await this._createAuditLog(
      'UPDATE_MAINTENANCE_MODE',
      changes,
      config._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    // Clear cache
    clearCache();

    return config.populate('updatedBy', 'fullName email');
  }

  /**
   * Update system info
   */
  async updateSystemInfo(updates, performedBy, reason, ipAddress, userAgent) {
    const config = await this.getSystemConfig();
    const oldValues = {
      systemName: config.systemInfo.systemName,
      supportEmail: config.systemInfo.supportEmail,
      supportPhoneNumber: config.systemInfo.supportPhoneNumber,
    };

    const changes = {};

    if (updates.hasOwnProperty('systemName')) {
      if (typeof updates.systemName !== 'string' || updates.systemName.length === 0) {
        throw new Error('System name must be non-empty string');
      }
      if (updates.systemName.length > 100) {
        throw new Error('System name must not exceed 100 characters');
      }
      if (oldValues.systemName !== updates.systemName) {
        changes.systemName = {
          oldValue: oldValues.systemName,
          newValue: updates.systemName,
        };
        config.systemInfo.systemName = updates.systemName;
      }
    }

    if (updates.hasOwnProperty('supportEmail')) {
      if (!updates.supportEmail.match(/.+\@.+\..+/)) {
        throw new Error('Invalid email format');
      }
      if (oldValues.supportEmail !== updates.supportEmail) {
        changes.supportEmail = {
          oldValue: oldValues.supportEmail,
          newValue: updates.supportEmail,
        };
        config.systemInfo.supportEmail = updates.supportEmail;
      }
    }

    if (updates.hasOwnProperty('supportPhoneNumber')) {
      if (typeof updates.supportPhoneNumber !== 'string' || updates.supportPhoneNumber.length === 0) {
        throw new Error('Support phone number must be non-empty string');
      }
      if (oldValues.supportPhoneNumber !== updates.supportPhoneNumber) {
        changes.supportPhoneNumber = {
          oldValue: oldValues.supportPhoneNumber,
          newValue: updates.supportPhoneNumber,
        };
        config.systemInfo.supportPhoneNumber = updates.supportPhoneNumber;
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error('No changes made to system info');
    }

    config.updatedBy = performedBy;
    await config.save();

    await this._createAuditLog(
      'UPDATE_SYSTEM_INFO',
      changes,
      config._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    // Clear cache
    clearCache();

    return config.populate('updatedBy', 'fullName email');
  }

  /**
   * Get audit logs with pagination
   */
  async getAuditLogs(filters = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const query = { entity: 'SYSTEM_CONFIG' };

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.performedBy) {
      query.performedBy = filters.performedBy;
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('performedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Create audit log entry
   */
  async _createAuditLog(action, changes, entityId, performedBy, reason, ipAddress, userAgent) {
    return await AuditLog.create({
      action,
      changes,
      entity: 'SYSTEM_CONFIG',
      entityId,
      performedBy,
      reason: reason || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    });
  }
}

module.exports = new SystemConfigService();
