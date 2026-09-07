/**
 * Payment Auto-Cancel Background Job
 * Runs daily to cancel orders with pending payments beyond the configured threshold
 * Run via: npm run job:cancel-payments
 */

const Order = require('../models/Order');
const configCache = require('../utils/config-cache');

/**
 * Execute payment auto-cancel job
 * @returns {Promise<Object>} - Job result with cancelled count
 */
async function executePaymentAutoCancelJob() {
  try {
    console.log('[Payment Auto-Cancel Job] Starting at', new Date().toISOString());

    // Get business rules
    const rules = await configCache.getBusinessRules();
    const { paymentAutoCancelDays } = rules;

    // Calculate cutoff date
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - paymentAutoCancelDays);

    // Find orders pending payment beyond cutoff
    const oldPendingOrders = await Order.find({
      $and: [
        {
          $or: [{ paymentStatus: 'Pending Payment' }, { paymentStatus: 'Under Review' }],
        },
        {
          createdAt: { $lt: cutoffDate },
        },
        {
          orderStatus: { $ne: 'Cancelled' }, // Not already cancelled
        },
      ],
    });

    console.log(`[Payment Auto-Cancel Job] Found ${oldPendingOrders.length} orders to cancel`);

    // Cancel each order
    const cancelledOrders = [];
    for (const order of oldPendingOrders) {
      try {
        const updated = await Order.findByIdAndUpdate(
          order._id,
          {
            orderStatus: 'Cancelled',
            paymentStatus: 'Rejected',
            status: 'Cancelled',
          },
          { new: true, runValidators: true }
        );

        cancelledOrders.push({
          _id: updated._id,
          orderRef: updated.orderRef || updated.orderReference || updated.orderId,
          customer: updated.customer || updated.userId,
          amount: updated.amount ?? updated.total ?? updated.subtotal ?? 0,
        });

        console.log(`[Payment Auto-Cancel Job] Cancelled order: ${updated.orderRef || updated.orderReference || updated.orderId}`);
      } catch (err) {
        console.error(`[Payment Auto-Cancel Job] Error cancelling order ${order.orderRef}:`, err.message);
      }
    }

    const result = {
      success: true,
      executedAt: now,
      paymentAutoCancelDays,
      cutoffDate,
      totalFound: oldPendingOrders.length,
      totalCancelled: cancelledOrders.length,
      cancelledOrders,
    };

    console.log('[Payment Auto-Cancel Job] Completed:', result);
    return result;
  } catch (error) {
    console.error('[Payment Auto-Cancel Job] Error:', error);
    return {
      success: false,
      error: error.message,
      executedAt: new Date(),
    };
  }
}

/**
 * Schedule job to run daily at 2 AM
 * Requires node-schedule package
 */
function schedulePaymentAutoCancelJob() {
  try {
    const schedule = require('node-schedule');

    // Schedule for 2 AM every day
    const job = schedule.scheduleJob('0 2 * * *', async () => {
      console.log('[Payment Auto-Cancel Job] Scheduled job triggered');
      await executePaymentAutoCancelJob();
    });

    console.log('[Payment Auto-Cancel Job] Scheduled successfully (2 AM daily)');
    return job;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn('[Payment Auto-Cancel Job] node-schedule not installed. Job scheduling disabled.');
      console.warn('Install with: npm install node-schedule');
      return null;
    }
    throw err;
  }
}

module.exports = {
  executePaymentAutoCancelJob,
  schedulePaymentAutoCancelJob,
};
