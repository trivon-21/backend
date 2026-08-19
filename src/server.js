const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Register legacy shared model collections used by finance and reporting flows.
require('./modules/shared/L_installations.model');
require('./modules/shared/L_inventories.model');
require('./modules/shared/L_charges.model');
require('./modules/shared/L_sellingPrice.model');
require('./modules/shared/L_serviceReport.model');
require('./modules/shared/L_bankDetails.model');
require('./modules/shared/L_repair.model');
require('./modules/shared/L_purchaseRequest.model');

const app = require('./app');
const { connectDb } = require('./config');
const { schedulePaymentAutoCancelJob } = require('./jobs/paymentAutoCancelJob');
const maintenanceNotificationService = require('./services/maintenance-notification.service');

const PORT = process.env.PORT || 5000;

/**
 * Startup repair job — runs once after DB connects.
 * Scans for completed Installations with no linked MaintenanceSchedule and
 * creates the missing records. Safe: never deletes data, never throws to crash boot.
 */
const runStartupRepair = async () => {
  try {
    const Installation = require('./modules/shared/installation/installation.model');
    const MaintenanceSchedule = require('./modules/shared/maintenance/maintenanceSchedule.model');
    const { buildServiceTemplate, buildScheduleEndDate } = require('./modules/shared/maintenance/scheduleTemplate');
    const Customer = require('./modules/user/user.model');
    const {
      EXECUTION_STATUS,
      MAINTENANCE_SCHEDULE_STATUS,
      INSTALLATION_MAINTENANCE_STATUS
    } = require('./constants/enums');

    const orphaned = await Installation.find({
      status: EXECUTION_STATUS.COMPLETED,
      maintenanceScheduleId: null
    }).lean();

    if (orphaned.length === 0) {
      console.log('✅ Startup repair: all completed installations already have a MaintenanceSchedule.');
    } else {
      console.log(`⚙️  Startup repair: found ${orphaned.length} completed installation(s) with no schedule — creating now...`);
      let created = 0;
      for (const inst of orphaned) {
        try {
          const customer = await Customer.findById(inst.customerId).lean();
          if (!customer) continue;

          const services = buildServiceTemplate(new Date(inst.date || inst.serviceDate || inst.createdAt));
          const scheduleEndDate = buildScheduleEndDate(new Date(inst.date || inst.serviceDate || inst.createdAt));
          const newSchedule = new MaintenanceSchedule({
            customerId: customer._id,
            customerName: customer.name,
            customerEmail: customer.email,
            customerPhone: customer.contactNo,
            productType: inst.productType,
            location: inst.location,
            ticketId: `MS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            status: MAINTENANCE_SCHEDULE_STATUS.NEW,
            services,
            scheduleEndDate,
            installationId: inst._id,
            installationDate: inst.date || inst.serviceDate || inst.createdAt
          });

          const saved = await newSchedule.save();
          await Installation.findByIdAndUpdate(inst._id, {
            maintenanceScheduleId: saved._id,
            maintenanceStatus: INSTALLATION_MAINTENANCE_STATUS.PENDING_CSA
          });
          created++;
        } catch (err) {
          console.error(`Error repairing installation ${inst._id}:`, err);
        }
      }
      console.log(`✅ Startup repair complete. Created ${created} missing schedules.`);
    }
  } catch (err) {
    console.error('⚠️ Startup repair encountered an error (non-fatal):', err.message);
  }
};

function scheduleScheduledMaintenanceStartWatcher() {
  const runCheck = async () => {
    try {
      await maintenanceNotificationService.processScheduledMaintenanceStartNotifications();
    } catch (error) {
      console.error('Scheduled maintenance start watcher failed:', error.message);
    }
  };

  runCheck();
  setInterval(runCheck, 60 * 1000);
}

const startServer = async () => {
  try {
    await connectDb();
    console.log('MongoDB connected');

    // Run the repair job after DB is ready, before accepting traffic
    await runStartupRepair();

    try {
      schedulePaymentAutoCancelJob();
      scheduleScheduledMaintenanceStartWatcher();
      console.log('Background jobs scheduled successfully');
    } catch (err) {
      console.warn('Warning: Could not schedule background jobs:', err.message);
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
