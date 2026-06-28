/**
 * Maintenance Reminder Scheduler
 * Runs the reminder job at specified intervals to:
 * 1. Send pending reminders to customers
 * 2. Process accepted reminders and create maintenance records
 */

const runReminderJob = require('./reminder.job');

let schedulerInterval = null;

const startReminderScheduler = (intervalMinutes = 60) => {
  if (schedulerInterval) {
    console.log('Reminder scheduler already running');
    return;
  }

  console.log(`Starting reminder scheduler (interval: ${intervalMinutes} minutes)`);

  // Run immediately on startup
  runReminderJob().catch(err => console.error('Initial reminder job failed:', err));

  // Run at specified interval
  schedulerInterval = setInterval(() => {
    console.log(`[${new Date().toISOString()}] Running maintenance reminder job...`);
    runReminderJob().catch(err => console.error('Scheduled reminder job failed:', err));
  }, intervalMinutes * 60 * 1000);

  // Allow graceful shutdown
  process.on('SIGTERM', () => {
    stopReminderScheduler();
  });
  process.on('SIGINT', () => {
    stopReminderScheduler();
  });
};

const stopReminderScheduler = () => {
  if (schedulerInterval) {
    console.log('Stopping reminder scheduler');
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

module.exports = {
  startReminderScheduler,
  stopReminderScheduler
};
