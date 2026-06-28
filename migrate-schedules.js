const mongoose = require('mongoose');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { buildServiceTemplate, buildScheduleEndDate } = require('./src/modules/shared/maintenance/scheduleTemplate');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const col = db.collection('MaintenanceSchedules');

  const all = await col.find({}).toArray();
  console.log('Total schedules found:', all.length);

  let upgraded = 0;
  let reset = 0;

  for (const doc of all) {
    const updates = {};

    // 1) Upgrade 4-service records to 6 services
    if (!doc.services || doc.services.length < 6) {
      const existing = doc.services || [];
      const template = buildServiceTemplate();
      const merged = template.map((svc, i) => ({
        serviceName:   svc.serviceName,
        underWarranty: svc.underWarranty,
        date:          existing[i] ? existing[i].date : null,
      }));
      updates.services = merged;
      upgraded++;
    }

    // 2) Add scheduleEndDate if missing
    if (!doc.scheduleEndDate && doc.installationDate) {
      updates.scheduleEndDate = buildScheduleEndDate(doc.installationDate);
    }

    // 3) Reset 'Sent to CSA' back to 'New'
    if (doc.status === 'Sent to CSA') {
      updates.status = 'New';
      updates.sentToCsaAt = null;
      reset++;
    }

    if (Object.keys(updates).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set: updates });
      console.log('  Updated:', doc.ticketId, '|', Object.keys(updates).join(', '));
    }
  }

  console.log('');
  console.log('Migration complete:');
  console.log('  Upgraded to 6 services:', upgraded);
  console.log('  Reset Sent to CSA -> New:', reset);

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch(e => { console.error(e); process.exit(1); });
