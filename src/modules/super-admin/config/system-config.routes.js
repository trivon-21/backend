const express = require('express');
const systemConfigController = require('./system-config.controller');
const { protect } = require('../../../middleware/protect');
const { authorize } = require('../../../middleware/role.middleware');

const router = express.Router();

// All routes require authentication and SUPER_ADMIN role
router.use(protect);
router.use(authorize(['SUPER_ADMIN']));

// Get system configuration
router.get('/', systemConfigController.getSystemConfig);

// Update business rules
router.put('/business-rules', systemConfigController.updateBusinessRules);

// Update feature flags
router.put('/feature-flags', systemConfigController.updateFeatureFlags);

// Update maintenance mode
router.put('/maintenance', systemConfigController.updateMaintenanceMode);

// Update system info
router.put('/system-info', systemConfigController.updateSystemInfo);

// Update logging settings (retention, flags, log level)
router.put('/logging', systemConfigController.updateLoggingSettings);

// Get audit logs
router.get('/audit-logs', systemConfigController.getAuditLogs);

module.exports = router;
