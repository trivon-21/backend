const path = require('path');
const dotenv = require('dotenv');

const app = require('./app');
const { connectDb } = require('./config');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 3000;

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
    const Customer = require('./modules/customer/customer.model');
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
      return;
    }

    console.log(`⚙️  Startup repair: found ${orphaned.length} completed installation(s) with no schedule — creating now...`);

    let created = 0;
    let repaired = 0;

    for (const inst of orphaned) {
      try {
        // Maybe a schedule exists but the reference on the installation is missing
        const existing = await MaintenanceSchedule.findOne({ installationId: inst._id });
        if (existing) {
          await Installation.findByIdAndUpdate(inst._id, {
            maintenanceScheduleId: existing._id,
            maintenanceStatus: INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED
          });
          repaired++;
          continue;
        }

        const customer = await Customer.findById(inst.customerId).lean();
        const tsSegment = Date.now().toString(36).toUpperCase();
        const idSuffix  = String(inst._id).slice(-6).toUpperCase();
        const ticketId  = `MS-${tsSegment}-${idSuffix}`;

        const installationDate = inst.serviceDate || inst.date || inst.createdAt || new Date();

        const schedule = await MaintenanceSchedule.create({
          ticketId,
          installationId:   inst._id,
          customerId:       inst.customerId,
          customerName:     customer?.name     || 'Unknown Customer',
          customerEmail:    customer?.email    || null,
          customerPhone:    customer?.contactNo || null,
          installationDate,
          scheduleEndDate:  buildScheduleEndDate(installationDate),
          location:         customer?.address  || inst.location || '-',
          productType:      inst.productType   || 'Standard AC System',
          services:         buildServiceTemplate(),   // 6 services: first 4 under warranty
          status: MAINTENANCE_SCHEDULE_STATUS.NEW,
        });

        await Installation.findByIdAndUpdate(inst._id, {
          maintenanceScheduleId: schedule._id,
          maintenanceStatus: INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED
        });

        created++;
        console.log(`  → Created schedule ${ticketId} for installation ${inst._id}`);
      } catch (err) {
        console.error(`  ✗ Failed for installation ${inst._id}:`, err.message);
      }
    }

    console.log(`✅ Startup repair complete: ${created} created, ${repaired} references repaired.`);
  } catch (err) {
    // Never crash the server over a repair failure
    console.error('⚠️  Startup repair encountered an error (non-fatal):', err.message);
  }
};

const startServer = async () => {
  try {
    await connectDb();
    console.log('MongoDB connected');

    // Run the repair job after DB is ready, before accepting traffic
    await runStartupRepair();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();

