/**
 * Super Admin Logs Routes
 */

const express = require('express');
const LogsController = require('./logs.controller');

const router = express.Router();

/**
 * Logs Management Routes
 */

// Get all logs with filters
router.get('/', LogsController.getLogs);

// Get logs by specific type
router.get('/activity', LogsController.getActivityLogs);
router.get('/errors', LogsController.getErrorLogs);
router.get('/security', LogsController.getSecurityLogs);

// Analytics and statistics
router.get('/analytics/dashboard', LogsController.getDashboardAnalytics);

// Filter options
router.get('/filters/options', LogsController.getFilterOptions);

// Search functionality
router.get('/search', LogsController.searchLogs);

// Export functionality
router.get('/export/csv', LogsController.exportLogsCSV);
router.get('/export/json', LogsController.exportLogsJSON);

// Retention policy management
router.get('/retention/policy', LogsController.getRetentionPolicy);
router.post('/cleanup', LogsController.cleanupOldLogs);

// Specific logs routes
router.get('/user/:userId', LogsController.getUserActivityTimeline);
router.get('/role/:role', LogsController.getRoleActivitySummary);
router.get('/:id', LogsController.getLogById);

// Deletion routes
router.delete('/:id', LogsController.deleteLog);
router.post('/bulk-delete', LogsController.bulkDeleteLogs);

module.exports = router;
