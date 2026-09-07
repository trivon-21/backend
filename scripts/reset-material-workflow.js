const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const APPLY_TOKEN = '--confirm-reset=RESET-MATERIAL-WORKFLOW';

function backupName(collection, timestamp) {
  return `${collection}_backup_${timestamp}`;
}

function inventoryTotals(items) {
  return new Map(items.map((item) => [String(item._id), Number(item.available || 0) + Number(item.reserved || 0)]));
}

async function countDownstreamReferences(db, jobIds, warehouseIds) {
  const [purchaseRequests, leftoverReturns] = await Promise.all([
    jobIds.length ? db.collection('purchase_requests').countDocuments({ sourceMaterialRequestId: { $in: jobIds } }) : 0,
    warehouseIds.length ? db.collection('leftover_returns').countDocuments({ warehousePickRequestId: { $in: warehouseIds } }) : 0,
  ]);
  return { purchaseRequests, leftoverReturns, total: purchaseRequests + leftoverReturns };
}

async function recomputeTeamCounts(db, teamIds, session) {
  if (!teamIds.length) return;
  const counts = new Map(teamIds.map((id) => [String(id), 0]));
  for (const collectionName of ['repairs', 'installations', 'inspection_tickets', 'maintenances']) {
    const jobs = await db.collection(collectionName).find({
      status: 'In Progress',
      $or: [{ assignedTeamId: { $in: teamIds } }, { assignedTeam: { $in: teamIds } }],
    }, { session, projection: { assignedTeamId: 1, assignedTeam: 1 } }).toArray();
    for (const job of jobs) {
      const key = String(job.assignedTeamId || job.assignedTeam || '');
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    }
  }
  for (const [teamId, count] of counts) {
    await db.collection('tech_teams').updateOne(
      { _id: new mongoose.Types.ObjectId(teamId) },
      { $set: { activeJobsCount: count, status: count > 0 ? 'On Job' : 'Available' } },
      { session },
    );
  }
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
  const [jobDocs, warehouseDocs, reservedInventory] = await Promise.all([
    jobRequests.find({}, { projection: { _id: 1 } }).toArray(),
    warehouseRequests.find({}, { projection: { _id: 1, assignedTeamId: 1 } }).toArray(),
    inventory.find({ reserved: { $gt: 0 } }, { projection: { _id: 1, available: 1, reserved: 1 } }).toArray(),
  ]);
  const dependencies = await countDownstreamReferences(
    db, jobDocs.map((item) => item._id), warehouseDocs.map((item) => item._id),
  );
  const summary = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    jobMaterialRequests: jobDocs.length,
    warehousePickRequests: warehouseDocs.length,
    inventoryItemsWithReservations: reservedInventory.length,
    reservedUnitsToRelease: reservedInventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0),
    downstreamReferences: dependencies,
  };
  logger.table(summary);
  if (!apply) {
    logger.log(`No data changed. Re-run with --apply ${APPLY_TOKEN} after reviewing the counts.`);
    return summary;
  }
  if (dependencies.total) {
    throw new Error(`Reset blocked by ${dependencies.total} downstream purchase/leftover-return reference(s).`);
  }

  const timestampKey = timestamp.toISOString().replace(/\D/g, '').slice(0, 17);
  const jobBackup = backupName('job_material_requests', timestampKey);
  const warehouseBackup = backupName('warehouse_pick_requests', timestampKey);
  const inventoryBackup = backupName('inventory_reserved', timestampKey);
  await Promise.all([
    jobRequests.aggregate([{ $match: {} }, { $out: jobBackup }]).toArray(),
    warehouseRequests.aggregate([{ $match: {} }, { $out: warehouseBackup }]).toArray(),
    inventory.aggregate([{ $match: { reserved: { $gt: 0 } } }, { $out: inventoryBackup }]).toArray(),
  ]);
  const [jobBackupCount, warehouseBackupCount, inventoryBackupCount] = await Promise.all([
    db.collection(jobBackup).countDocuments(),
    db.collection(warehouseBackup).countDocuments(),
    db.collection(inventoryBackup).countDocuments(),
  ]);
  if (jobBackupCount !== jobDocs.length || warehouseBackupCount !== warehouseDocs.length
    || inventoryBackupCount !== reservedInventory.length) {
    throw new Error('Backup verification failed; no workflow data was deleted.');
  }

  await transaction(async session => {
    await jobRequests.deleteMany({}, { session });
    await warehouseRequests.deleteMany({}, { session });
    await inventory.updateMany({ reserved: { $gt: 0 } }, [{
      $set: {
        available: { $add: [{ $ifNull: ['$available', 0] }, { $ifNull: ['$reserved', 0] }] },
        reserved: 0,
      },
    }], { session });
    const teamIds = [...new Set(warehouseDocs.map((item) => item.assignedTeamId).filter(Boolean).map(String))]
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    await recomputeTeamCounts(db, teamIds, session);
  });
  const affectedIds = reservedInventory.map((item) => item._id);
  const updatedInventory = affectedIds.length
    ? await inventory.find({ _id: { $in: affectedIds } }, { projection: { _id: 1, available: 1, reserved: 1 } }).toArray()
    : [];
  const beforeTotals = inventoryTotals(reservedInventory);
  const stockConserved = updatedInventory.every((item) => Number(item.reserved || 0) === 0
    && beforeTotals.get(String(item._id)) === Number(item.available || 0));
  const [remainingJobs, remainingWarehouse] = await Promise.all([
    jobRequests.countDocuments(), warehouseRequests.countDocuments(),
  ]);
  if (!stockConserved || remainingJobs || remainingWarehouse) {
    throw new Error('Post-reset verification failed; restore from the named backup collections.');
  }
  logger.log(`Reset complete. Backup collections: ${jobBackup}, ${warehouseBackup}, ${inventoryBackup}`);
  return { ...summary, jobBackup, warehouseBackup, inventoryBackup, stockConserved };
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

module.exports = {
  APPLY_TOKEN, backupName, countDownstreamReferences, inventoryTotals,
  recomputeTeamCounts, resetWorkflow, main,
};
