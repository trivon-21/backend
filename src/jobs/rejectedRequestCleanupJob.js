/**
 * Rejected Request Cleanup Background Job
 * Runs daily to permanently remove rejected purchase requests and rejected
 * receipt (Non-PO) authorizations older than the configured retention period.
 */

const PurchaseRequest = require('../models/PurchaseRequest');
const ReceiptAuthorization = require('../models/ReceiptAuthorization');
const configCache = require('../utils/config-cache');

/**
 * Execute rejected request cleanup job
 * @returns {Promise<Object>} - Job result with deleted counts
 */
async function executeRejectedRequestCleanupJob() {
  try {
    console.log('[Rejected Request Cleanup Job] Starting at', new Date().toISOString());

    const rules = await configCache.getBusinessRules();
    const { rejectedRequestRetentionDays } = rules;

    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - rejectedRequestRetentionDays);

    const purchaseRequestResult = await PurchaseRequest.deleteMany({
      status: 'rejected',
      rejectedAt: { $lt: cutoffDate },
    });

    const receiptAuthorizationResult = await ReceiptAuthorization.deleteMany({
      status: 'rejected',
      rejectedAt: { $lt: cutoffDate },
    });

    const result = {
      success: true,
      executedAt: now,
      rejectedRequestRetentionDays,
      cutoffDate,
      purchaseRequestsDeleted: purchaseRequestResult.deletedCount || 0,
      receiptAuthorizationsDeleted: receiptAuthorizationResult.deletedCount || 0,
    };

    console.log('[Rejected Request Cleanup Job] Completed:', result);
    return result;
  } catch (error) {
    console.error('[Rejected Request Cleanup Job] Error:', error);
    return {
      success: false,
      error: error.message,
      executedAt: new Date(),
    };
  }
}

/**
 * Schedule job to run daily at 3 AM
 * Requires node-schedule package
 */
function scheduleRejectedRequestCleanupJob() {
  try {
    const schedule = require('node-schedule');

    const job = schedule.scheduleJob('0 3 * * *', async () => {
      console.log('[Rejected Request Cleanup Job] Scheduled job triggered');
      await executeRejectedRequestCleanupJob();
    });

    console.log('[Rejected Request Cleanup Job] Scheduled successfully (3 AM daily)');
    return job;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn('[Rejected Request Cleanup Job] node-schedule not installed. Job scheduling disabled.');
      console.warn('Install with: npm install node-schedule');
      return null;
    }
    throw err;
  }
}

module.exports = {
  executeRejectedRequestCleanupJob,
  scheduleRejectedRequestCleanupJob,
};
