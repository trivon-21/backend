const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const APPLY_TOKEN = '--confirm-reset=RESET-MATERIAL-WORKFLOW';

function backupName(collection, timestamp) {
  return `${collection}_backup_${timestamp}`;
}

async function resetWorkflow({
  db,
  apply = false,
  confirmed = false,
  timestamp = new Date(),
  transaction = callback => mongoose.connection.transaction(callback),
  logger = console,
}) {
  if (apply && !confirmed) {
    throw new Error(`Applying the reset requires ${APPLY_TOKEN}`);
  }
  const jobRequests = db.collection('job_material_requests');
  const warehouseRequests = db.collection('warehouse_pick_requests');
  const inventory = db.collection('inventory');
  const [jobCount, warehouseCount, reservationSummary] = await Promise.all([
    jobRequests.countDocuments(),
    warehouseRequests.countDocuments(),
    inventory.aggregate([{ $group: {
      _id: null,
      items: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$reserved', 0] }, 0] }, 1, 0] } },
      units: { $sum: { $ifNull: ['$reserved', 0] } },
    } }]).toArray(),
  ]);
  const summary = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    jobMaterialRequests: jobCount,
    warehousePickRequests: warehouseCount,
    inventoryItemsWithReservations: reservationSummary[0]?.items || 0,
    reservedUnitsToRelease: reservationSummary[0]?.units || 0,
  };
  logger.table(summary);
  if (!apply) {
    logger.log(`No data changed. Re-run with --apply ${APPLY_TOKEN} after reviewing the counts.`);
    return summary;
  }

  const timestampKey = timestamp.toISOString().replace(/\D/g, '').slice(0, 17);
  const jobBackup = backupName('job_material_requests', timestampKey);
  const warehouseBackup = backupName('warehouse_pick_requests', timestampKey);
  await Promise.all([
    jobRequests.aggregate([{ $match: {} }, { $out: jobBackup }]).toArray(),
    warehouseRequests.aggregate([{ $match: {} }, { $out: warehouseBackup }]).toArray(),
  ]);

  await transaction(async session => {
    await jobRequests.deleteMany({}, { session });
    await warehouseRequests.deleteMany({}, { session });
    await inventory.updateMany({}, [{
      $set: {
        available: { $add: [{ $ifNull: ['$available', 0] }, { $ifNull: ['$reserved', 0] }] },
        reserved: 0,
      },
    }], { session });
  });
  logger.log(`Reset complete. Backup collections: ${jobBackup}, ${warehouseBackup}`);
  return { ...summary, jobBackup, warehouseBackup };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes(APPLY_TOKEN);
  await connectDB();
  return resetWorkflow({ db: mongoose.connection.db, apply, confirmed });
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => mongoose.disconnect());
}

module.exports = { APPLY_TOKEN, backupName, resetWorkflow, main };
