const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const APPLY_TOKEN = '--confirm-backfill=BACKFILL-WAREHOUSE-PICK-SOURCE';

// Resolves the JobMaterialRequest that a legacy WarehousePickRequest belongs to:
// the reverse link (JobMaterialRequest.warehousePickRequestId) first, falling back
// to the business key (jobId + jobType) used when the JMR-side link was never set.
async function resolveSourceJmr(jobRequests, warehouseDoc) {
  return (await jobRequests.findOne({ warehousePickRequestId: warehouseDoc._id }))
    || (await jobRequests.findOne({ jobId: warehouseDoc.jobId, jobType: warehouseDoc.jobType }));
}

async function backfillWarehousePickSource({
  db,
  apply = false,
  confirmed = false,
  logger = console,
}) {
  if (apply && !confirmed) {
    throw new Error(`Applying the backfill requires ${APPLY_TOKEN}`);
  }

  const jobRequests = db.collection('job_material_requests');
  const warehouseRequests = db.collection('warehouse_pick_requests');

  const candidates = await warehouseRequests.find({
    sourceMaterialRequestId: { $not: { $type: 'objectId' } },
  }).toArray();

  const resolvedByReverseLink = [];
  const resolvedByFallback = [];
  const conflicts = [];
  const unresolved = [];

  for (const warehouseDoc of candidates) {
    const jmr = await resolveSourceJmr(jobRequests, warehouseDoc);
    if (!jmr) {
      unresolved.push({ requestId: warehouseDoc.requestId, _id: warehouseDoc._id });
      continue;
    }
    const alreadyLinked = await warehouseRequests.findOne({
      _id: { $ne: warehouseDoc._id },
      sourceMaterialRequestId: jmr._id,
    });
    if (alreadyLinked) {
      conflicts.push({
        requestId: warehouseDoc.requestId, _id: warehouseDoc._id,
        jmrId: jmr._id, conflictingRequestId: alreadyLinked.requestId,
      });
      continue;
    }
    const entry = { requestId: warehouseDoc.requestId, _id: warehouseDoc._id, sourceMaterialRequestId: jmr._id };
    if (String(jmr.warehousePickRequestId || '') === String(warehouseDoc._id)) {
      resolvedByReverseLink.push(entry);
    } else {
      resolvedByFallback.push(entry);
    }
  }

  const summary = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    candidates: candidates.length,
    resolvedByReverseLink: resolvedByReverseLink.length,
    resolvedByFallback: resolvedByFallback.length,
    conflictsSkipped: conflicts.length,
    unresolved: unresolved.length,
  };
  logger.table(summary);
  if (conflicts.length) logger.log('Conflicts (manual review needed):', conflicts);
  if (unresolved.length) logger.log('Unresolved (no matching JobMaterialRequest found):', unresolved);

  if (!apply) {
    logger.log(`No data changed. Re-run with --apply ${APPLY_TOKEN} after reviewing the summary.`);
    return summary;
  }

  const toWrite = [...resolvedByReverseLink, ...resolvedByFallback];
  let updated = 0;
  for (const entry of toWrite) {
    const result = await warehouseRequests.updateOne(
      { _id: entry._id, sourceMaterialRequestId: { $exists: false } },
      { $set: { sourceMaterialRequestId: entry.sourceMaterialRequestId } },
    );
    updated += result.modifiedCount;
  }
  logger.log(`Backfill complete. Updated ${updated} of ${toWrite.length} resolved record(s).`);
  return { ...summary, updated };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes(APPLY_TOKEN);
  await connectDB();
  return backfillWarehousePickSource({ db: mongoose.connection.db, apply, confirmed });
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => mongoose.disconnect());
}

module.exports = { APPLY_TOKEN, resolveSourceJmr, backfillWarehousePickSource, main };
