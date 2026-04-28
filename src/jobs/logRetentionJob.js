/**
 * Log Retention Cleanup Background Job
 * Runs daily to delete logs older than the configured retention period
 * Run via: npm run job:cleanup-logs
 */

const LoggingService = require('../utils/logging-service');
const configCache = require('../utils/config-cache');

/**
 * Execute log retention cleanup job
 * @returns {Promise<Object>} - Job result with deleted count
 */
async function executeLogRetentionJob() {
  try {
    console.log('[Log Retention Job] Starting at', new Date().toISOString());

    // Get log retention policy from system config
    const config = await configCache.getSystemConfig();
    // Prefer business rule if set, otherwise fall back to logging section, then default
    const retentionDays =
      (config && config.businessRules && typeof config.businessRules.logRetentionDays === 'number')
        ? config.businessRules.logRetentionDays
        : (config?.logging?.logRetentionDays || 30);

    console.log(`[Log Retention Job] Retention period: ${retentionDays} days`);

    // Delete old logs
    const result = await LoggingService.deleteOldLogs(retentionDays);

    const jobResult = {
      success: true,
      executedAt: new Date(),
      retentionDays,
      cutoffDate: result.cutoffDate,
      deletedCount: result.deletedCount,
      message: `Successfully deleted ${result.deletedCount} logs older than ${retentionDays} days`,
    };

    console.log(`[Log Retention Job] Completed: ${jobResult.message}`);
    return jobResult;
  } catch (error) {
    console.error('[Log Retention Job] Error:', error.message);
    throw error;
  }
}

/**
 * Export for manual invocation
 */
module.exports = {
  executeLogRetentionJob,
};
