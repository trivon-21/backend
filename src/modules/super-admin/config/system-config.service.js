const SystemConfig = require('../../../models/SystemConfig');
const AuditLog = require('../../../models/AuditLog');
const Charge = require('../../shared/L_charges.model');
const BankDetail = require('../../../models/bankDetail.model');
const { clearCache } = require('../../../utils/config-cache');
const maintenanceNotificationService = require('../../../services/maintenance-notification.service');

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

    // Sync standard service fees from charges collection
    try {
      const charges = await Charge.find({}).lean();
      const maintenanceCharge = charges.find(c => /maintenance/i.test(c.name));
      const repairCharge = charges.find(c => /repair/i.test(c.name));
      const siteInspectionCharge = charges.find(c => /site inspection/i.test(c.name));

      let needsSave = false;
      if (maintenanceCharge && config.businessRules) {
        if (config.businessRules.standardMaintenanceFee !== maintenanceCharge.amount) {
          config.businessRules.standardMaintenanceFee = maintenanceCharge.amount;
          needsSave = true;
        }
      }
      if (repairCharge && config.businessRules) {
        if (config.businessRules.standardRepairFee !== repairCharge.amount) {
          config.businessRules.standardRepairFee = repairCharge.amount;
          needsSave = true;
        }
      }
      if (siteInspectionCharge && config.businessRules) {
        if (config.businessRules.standardSiteInspectionFee !== siteInspectionCharge.amount) {
          config.businessRules.standardSiteInspectionFee = siteInspectionCharge.amount;
          needsSave = true;
        }
      }
      if (needsSave) {
        await config.save();
      }
    } catch (err) {
      console.error('Error syncing charges in getSystemConfig:', err);
    }

    return config;
  }

  /**
   * Update business rules
   */
  async updateBusinessRules(updates, performedBy, reason, ipAddress, userAgent, performedByRole) {
    const config = await this.getSystemConfig();

    // Store old values for audit trail
    const oldValues = { ...config.businessRules.toObject() };
    const changes = {};

    // Validate and update each field
    for (const [key, value] of Object.entries(updates)) {
      if (!config.businessRules.hasOwnProperty(key)) {
        throw new Error(`Invalid business rule field: ${key}`);
      }

      // Validation and charges sync
      if (key === 'standardMaintenanceFee') {
        if (typeof value !== 'number' || value < 0) {
          throw new Error('Standard Maintenance Service Fee must be a number greater than or equal to 0');
        }
        await Charge.findOneAndUpdate(
          { name: { $regex: /^standard maintenance/i } },
          {
            $set: {
              name: 'Standard Maintenance Service Fee',
              amount: value,
              type: 'FIXED',
              description: 'Charged for scheduled/routine maintenance visits',
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      } else if (key === 'standardRepairFee') {
        if (typeof value !== 'number' || value < 0) {
          throw new Error('Standard Repair Service Fee must be a number greater than or equal to 0');
        }
        await Charge.findOneAndUpdate(
          { name: { $regex: /^standard repair/i } },
          {
            $set: {
              name: 'Standard Repair Service Fee',
              amount: value,
              type: 'FIXED',
              description: 'Charged for standard repair service call-outs',
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      } else if (key === 'standardSiteInspectionFee') {
        if (typeof value !== 'number' || value < 0) {
          throw new Error('Standard Site Inspection Fee must be a number greater than or equal to 0');
        }
        await Charge.findOneAndUpdate(
          { name: { $regex: /^standard site inspection/i } },
          {
            $set: {
              name: 'Standard Site Inspection Fee',
              amount: value,
              type: 'FIXED',
              description: 'Charged for pre-installation site inspections',
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      } else if (key === 'quotationApprovalThreshold') {
        if (value < 0 || value > 10000000) {
          throw new Error('Quotation approval threshold must be between 0 and 10,000,000');
        }
      } else if (key === 'paymentAutoCancelDays') {
        if (value < 1 || value > 365) {
          throw new Error('Payment auto-cancel days must be between 1 and 365');
        }
      } else if (key === 'logRetentionDays') {
        if (typeof value !== 'number' || value < 7 || value > 730) {
          throw new Error('logRetentionDays must be a number between 7 and 730');
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
      'Update Business Rules',
      'UPDATE',
      'SYSTEM_CONFIG',
      performedByRole || 'UNKNOWN',
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
  async updateFeatureFlags(updates, performedBy, reason, ipAddress, userAgent, performedByRole) {
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
      'Update Feature Flags',
      'UPDATE',
      'SYSTEM_CONFIG',
      performedByRole || 'UNKNOWN',
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
  async updateMaintenanceMode(updates, performedBy, reason, ipAddress, userAgent, performedByRole) {
    const config = await this.getSystemConfig();
    const oldValues = {
      isActive: config.maintenance.isActive,
      message: config.maintenance.message,
      maintenanceReason: config.maintenance.reason,
      startTime: config.maintenance.startTime,
      endTime: config.maintenance.endTime,
    };

    const changes = {};
    let isScheduled = false;
    let isActivating = false;
    let isDeactivating = false;

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
        isActivating = updates.isActive && !oldValues.isActive;
        isDeactivating = !updates.isActive && oldValues.isActive;
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
        config.maintenance.scheduledStartEmailSentAt = null;
        isScheduled = true;
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
        config.maintenance.scheduledStartEmailSentAt = null;
        isScheduled = true;
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

    // Determine maintenance type for audit log
    const hasScheduledTimes = config.maintenance.scheduledStartTime && config.maintenance.scheduledEndTime;
    const maintenanceType = isScheduled || hasScheduledTimes ? 'Scheduled' : 'Instant';
    changes.maintenanceType = maintenanceType;

    // Determine action name based on the type of change
    let actionName = 'Update Maintenance Settings';
    if (isScheduled) {
      actionName = 'Schedule Maintenance';
    } else if (isActivating) {
      actionName = hasScheduledTimes ? 'Activate Scheduled Maintenance' : 'Activate Instant Maintenance';
    } else if (updates.hasOwnProperty('isActive') && !updates.isActive) {
      actionName = 'Deactivate Maintenance';
    }

    config.updatedBy = performedBy;
    await config.save();

    await this._createAuditLog(
      actionName,
      'UPDATE',
      'SYSTEM_CONFIG',
      performedByRole || 'UNKNOWN',
      changes,
      config._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    // Clear cache
    clearCache();

    // Send maintenance notifications if maintenance is being activated or scheduled
    if (isActivating || isScheduled) {
      try {
        await maintenanceNotificationService.sendMaintenanceNotifications(config.maintenance);
      } catch (error) {
        console.error('Failed to send maintenance notifications:', error);
        // Don't throw - maintenance should still be activated even if notifications fail
      }
    }

    // Send maintenance finished notifications when maintenance is being deactivated
    if (isDeactivating) {
      try {
        await maintenanceNotificationService.sendMaintenanceFinishedNotifications();
      } catch (error) {
        console.error('Failed to send maintenance finished notifications:', error);
        // Don't throw - maintenance should still be deactivated even if notifications fail
      }
    }

    return config.populate('updatedBy', 'fullName email');
  }

  /**
   * Update system info
   */
  async updateSystemInfo(updates, performedBy, reason, ipAddress, userAgent, performedByRole) {
    const config = await this.getSystemConfig();
    const oldValues = {
      systemName: config.systemInfo.systemName,
      supportEmail: config.systemInfo.supportEmail,
      supportPhoneNumber: config.systemInfo.supportPhoneNumber,
      address: config.systemInfo.address,
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

    if (updates.hasOwnProperty('address')) {
      if (typeof updates.address !== 'string' || updates.address.length === 0) {
        throw new Error('Address must be non-empty string');
      }
      if (oldValues.address !== updates.address) {
        changes.address = {
          oldValue: oldValues.address,
          newValue: updates.address,
        };
        config.systemInfo.address = updates.address;
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error('No changes made to system info');
    }

    config.updatedBy = performedBy;
    await config.save();

    await this._createAuditLog(
      'Update System Info',
      'UPDATE',
      'SYSTEM_CONFIG',
      performedByRole || 'UNKNOWN',
      changes,
      config._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    // Clear cache
    clearCache();
    clearCache();

    return config.populate('updatedBy', 'fullName email');
  }

  /**
   * Update logging settings (logRetentionDays, enable flags, logLevel)
   */
  async updateLoggingSettings(updates, performedBy, reason, ipAddress, userAgent, performedByRole) {
    const config = await this.getSystemConfig();
    const oldValues = { ...config.logging.toObject() };
    const changes = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!config.logging.hasOwnProperty(key)) {
        throw new Error(`Invalid logging setting: ${key}`);
      }

      // Validation for specific fields
      if (key === 'logRetentionDays') {
        if (typeof value !== 'number' || value < 7 || value > 730) {
          throw new Error('logRetentionDays must be a number between 7 and 730');
        }
      }

      if (['enableActivityLogs', 'enableErrorLogs', 'enableSecurityLogs'].includes(key)) {
        if (typeof value !== 'boolean') {
          throw new Error(`${key} must be boolean`);
        }
      }

      if (key === 'logLevel') {
        const allowed = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];
        if (!allowed.includes(value)) {
          throw new Error('logLevel must be one of: ' + allowed.join(', '));
        }
      }

      if (oldValues[key] !== value) {
        changes[key] = {
          oldValue: oldValues[key],
          newValue: value,
        };
        config.logging[key] = value;
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error('No changes made to logging settings');
    }

    config.updatedBy = performedBy;
    await config.save();

    await this._createAuditLog(
      'Update Logging Settings',
      'UPDATE',
      'SYSTEM_CONFIG',
      performedByRole || 'UNKNOWN',
      changes,
      config._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    // Clear cache so new settings take effect
    clearCache();

    return config.populate('updatedBy', 'fullName email');
  }

  /**
   * Get bank details from bank_details collection
   */
  async getBankDetails() {
    let bankDetail = await BankDetail.findOne().populate('updatedBy', 'fullName email');
    if (!bankDetail) {
      bankDetail = await BankDetail.create({
        bankName: 'Commercial Bank',
        branch: 'Colombo 03',
        accountName: 'AirLux (Pvt) Ltd',
        accountNumber: '1000123456',
        type: 'Current',
        currency: 'LKR',
      });
      bankDetail = await bankDetail.populate('updatedBy', 'fullName email');
    }
    return bankDetail;
  }

  /**
   * Update bank details in bank_details collection
   */
  async updateBankDetails(updates, performedBy, reason, ipAddress, userAgent, performedByRole) {
    let bankDetail = await BankDetail.findOne();
    if (!bankDetail) {
      bankDetail = new BankDetail({
        bankName: 'Commercial Bank',
        branch: 'Colombo 03',
        accountName: 'AirLux (Pvt) Ltd',
        accountNumber: '1000123456',
        type: 'Current',
        currency: 'LKR',
      });
    }

    const oldValues = {
      bankName: bankDetail.bankName || '',
      branch: bankDetail.branch || '',
      accountName: bankDetail.accountName || '',
      accountNumber: bankDetail.accountNumber || '',
      type: bankDetail.type || 'Current',
      currency: bankDetail.currency || 'LKR',
    };

    const changes = {};

    if (updates.hasOwnProperty('bankName')) {
      if (typeof updates.bankName !== 'string' || !updates.bankName.trim()) {
        throw new Error('Bank name is required');
      }
      const val = updates.bankName.trim();
      if (oldValues.bankName !== val) {
        changes.bankName = { oldValue: oldValues.bankName, newValue: val };
        bankDetail.bankName = val;
      }
    }

    if (updates.hasOwnProperty('branch')) {
      if (typeof updates.branch !== 'string' || !updates.branch.trim()) {
        throw new Error('Branch name is required');
      }
      const val = updates.branch.trim();
      if (oldValues.branch !== val) {
        changes.branch = { oldValue: oldValues.branch, newValue: val };
        bankDetail.branch = val;
      }
    }

    if (updates.hasOwnProperty('accountName')) {
      if (typeof updates.accountName !== 'string' || !updates.accountName.trim()) {
        throw new Error('Account holder name is required');
      }
      const val = updates.accountName.trim();
      if (oldValues.accountName !== val) {
        changes.accountName = { oldValue: oldValues.accountName, newValue: val };
        bankDetail.accountName = val;
      }
    }

    if (updates.hasOwnProperty('accountNumber')) {
      if (typeof updates.accountNumber !== 'string' || !updates.accountNumber.trim()) {
        throw new Error('Account number is required');
      }
      const val = updates.accountNumber.trim();
      if (oldValues.accountNumber !== val) {
        changes.accountNumber = { oldValue: oldValues.accountNumber, newValue: val };
        bankDetail.accountNumber = val;
      }
    }

    if (updates.hasOwnProperty('type')) {
      if (typeof updates.type !== 'string' || !updates.type.trim()) {
        throw new Error('Account type must be valid');
      }
      const val = updates.type.trim();
      if (oldValues.type !== val) {
        changes.type = { oldValue: oldValues.type, newValue: val };
        bankDetail.type = val;
      }
    }

    if (updates.hasOwnProperty('currency')) {
      const val = (updates.currency || 'LKR').trim();
      if (oldValues.currency !== val) {
        changes.currency = { oldValue: oldValues.currency, newValue: val };
        bankDetail.currency = val;
      }
    }

    if (Object.keys(changes).length === 0) {
      throw new Error('No changes made to bank details');
    }

    bankDetail.updatedBy = performedBy;
    await bankDetail.save();

    await this._createAuditLog(
      'Update Bank Details',
      'UPDATE',
      'SYSTEM_CONFIG',
      performedByRole || 'SUPER_ADMIN',
      changes,
      bankDetail._id,
      performedBy,
      reason,
      ipAddress,
      userAgent
    );

    return await BankDetail.findById(bankDetail._id).populate('updatedBy', 'fullName email');
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
  async _createAuditLog(action, actionCategory, module, performedByRole, changes, entityId, performedBy, reason, ipAddress, userAgent) {
    return await AuditLog.create({
      action,
      actionCategory,
      module,
      performedByRole,
      changes: {
        before: {},
        after: changes,
      },
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
