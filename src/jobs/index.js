const { jobsEnabled } = require('../config/runtime');
function startBackgroundJobs() {
  if (!jobsEnabled()) return () => {};
  const jobs = [
    require('./paymentAutoCancelJob').schedulePaymentAutoCancelJob(),
    require('../modules/finance/invoice.controller').scheduleInvoiceReminders(),
    require('../modules/finance/inspectionTicket.controller').scheduleFinanceInspectionReminders(),
    require('../modules/shared/inspection/inspectionTicket.controller').scheduleInspectionReminders(),
  ];
  const periodic = (run, delay) => {
    const tick = () => Promise.resolve().then(run).catch(error => console.error('Background job failed:', error.message));
    tick();
    const handle = setInterval(tick, delay);
    handle.unref();
    return handle;
  };
  const timers = [
    periodic(() => require('../services/maintenance-notification.service').processScheduledMaintenanceStartNotifications(), 60000),
    periodic(() => require('../modules/super-admin/super-admin.service').processScheduledNotifications(), 30000),
  ];
  return () => {
    timers.forEach(clearInterval);
    jobs.forEach(job => { if (job?.stop) job.stop(); if (job?.cancel) job.cancel(); });
  };
}
module.exports = { startBackgroundJobs };
