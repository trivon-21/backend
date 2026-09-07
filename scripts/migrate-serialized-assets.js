'use strict';

const mongoose = require('mongoose');
const { createHash } = require('crypto');
const { normalizeSerialNumber } = require('../src/utils/serialized-asset-domain');

const APPLY_TOKEN = '--confirm-migration=MIGRATE-SERIALIZED-ASSET-REGISTRY';
const ACTIVE_RMA_STATUSES = new Set(['reported', 'under-review', 'sent-to-supplier']);

function registryId(normalizedSerial) {
  return new mongoose.Types.ObjectId(createHash('sha256').update(normalizedSerial).digest('hex').slice(0, 24));
}

function referenceMap(rows, serialField, active) {
  const map = new Map();
  const invalid = [];
  for (const row of rows.filter(active)) {
    const normalizedSerial = normalizeSerialNumber(row[serialField]);
    if (!normalizedSerial) {
      invalid.push(row);
      continue;
    }
    if (!map.has(normalizedSerial)) map.set(normalizedSerial, []);
    map.get(normalizedSerial).push(row);
  }
  return { map, invalid };
}

function buildRegistryPlan({ inventory = [], loans = [], rmaCases = [], quarantineItems = [] } = {}) {
  const activeLoans = referenceMap(loans, 'assetTag', (loan) => loan.status !== 'returned');
  const activeRmas = referenceMap(rmaCases, 'serialNumber', (rma) => ACTIVE_RMA_STATUSES.has(rma.status));
  const quarantined = new Map();
  for (const item of quarantineItems.filter((entry) => entry.status === 'quarantined')) {
    for (const serialNumber of item.serialNumbers || []) {
      const normalizedSerial = normalizeSerialNumber(serialNumber);
      if (!normalizedSerial) continue;
      if (!quarantined.has(normalizedSerial)) quarantined.set(normalizedSerial, []);
      quarantined.get(normalizedSerial).push(item);
    }
  }

  const owners = new Map();
  for (const item of inventory.filter((entry) => entry.isSerialized)) {
    for (const rawSerial of item.serialNumbers || []) {
      const normalizedSerial = normalizeSerialNumber(rawSerial);
      if (!normalizedSerial) continue;
      if (!owners.has(normalizedSerial)) owners.set(normalizedSerial, []);
      owners.get(normalizedSerial).push({ inventoryId: item._id, serialNumber: String(rawSerial).normalize('NFKC').trim() });
    }
  }

  const duplicateSerials = [];
  const assets = [];
  for (const [normalizedSerial, candidates] of owners) {
    const distinctOwners = [...new Set(candidates.map((candidate) => String(candidate.inventoryId)))];
    if (candidates.length > 1) {
      duplicateSerials.push({ normalizedSerial, inventoryIds: distinctOwners, occurrences: candidates.length });
    }
    const owner = candidates[0];
    const loan = activeLoans.map.get(normalizedSerial)?.[0];
    const rma = activeRmas.map.get(normalizedSerial)?.[0];
    const quarantine = quarantined.get(normalizedSerial)?.[0];
    const activeStates = [loan && 'on-loan', rma && 'rma', quarantine && 'quarantined'].filter(Boolean);
    assets.push({
      _id: registryId(normalizedSerial),
      inventoryId: owner.inventoryId,
      serialNumber: owner.serialNumber,
      normalizedSerial,
      status: quarantine ? 'quarantined' : rma ? 'rma' : loan ? 'on-loan' : 'available',
      currentLoanId: loan?._id,
      activeRmaCaseId: rma?._id,
      quarantineId: quarantine?._id,
      origin: 'migration',
      stateConflict: activeStates.length > 1 ? activeStates : undefined,
    });
  }

  const unknownReferences = [];
  for (const [source, map] of [
    ['asset_loans', activeLoans.map], ['rma_cases', activeRmas.map], ['quarantine_items', quarantined],
  ]) {
    for (const normalizedSerial of map.keys()) {
      if (!owners.has(normalizedSerial)) unknownReferences.push({ source, serialNumber: normalizedSerial });
    }
  }
  const stateConflicts = assets
    .filter((asset) => asset.stateConflict)
    .map((asset) => ({ normalizedSerial: asset.normalizedSerial, states: asset.stateConflict }));
  for (const [state, map] of [
    ['on-loan', activeLoans.map], ['rma', activeRmas.map], ['quarantined', quarantined],
  ]) {
    for (const [normalizedSerial, rows] of map) {
      if (rows.length > 1) stateConflicts.push({
        normalizedSerial,
        states: Array(rows.length).fill(state),
      });
    }
  }
  const assetsBySerial = new Map(assets.map((asset) => [asset.normalizedSerial, asset]));
  const loanLinks = loans.flatMap((loan) => {
    const normalizedAssetTag = normalizeSerialNumber(loan.assetTag);
    const asset = assetsBySerial.get(normalizedAssetTag);
    return asset ? [{ _id: loan._id, serializedAssetId: asset._id, normalizedAssetTag }] : [];
  });
  const rmaLinks = rmaCases.flatMap((rma) => {
    const asset = assetsBySerial.get(normalizeSerialNumber(rma.serialNumber));
    return asset ? [{ _id: rma._id, serializedAssetId: asset._id }] : [];
  });
  return { assets, duplicateSerials, unknownReferences, stateConflicts, loanLinks, rmaLinks };
}

async function applyPlan(db, client, plan) {
  if (!client?.startSession) throw new Error('A transaction-capable MongoDB client is required to apply the migration');
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      if (plan.assets.length) {
        await db.collection('serialized_assets').bulkWrite(plan.assets.map(({ stateConflict, ...asset }) => ({
          updateOne: { filter: { _id: asset._id }, update: { $setOnInsert: asset }, upsert: true },
        })), { ordered: false, session });
      }
      if (plan.loanLinks.length) {
        await db.collection('asset_loans').bulkWrite(plan.loanLinks.map(({ _id, ...fields }) => ({
          updateOne: { filter: { _id }, update: { $set: fields } },
        })), { ordered: false, session });
      }
      if (plan.rmaLinks.length) {
        await db.collection('rma_cases').bulkWrite(plan.rmaLinks.map(({ _id, ...fields }) => ({
          updateOne: { filter: { _id }, update: { $set: fields } },
        })), { ordered: false, session });
      }
    });
  } finally {
    await session.endSession();
  }
}

async function migrate({ db, client, apply = false, confirmed = false, logger = console } = {}) {
  if (!db) throw new Error('A MongoDB database handle is required');
  if (apply && !confirmed) throw new Error(`Applying the migration requires ${APPLY_TOKEN}`);
  const [inventory, loans, rmaCases, quarantineItems] = await Promise.all([
    db.collection('inventory').find({ isSerialized: true }).toArray(),
    db.collection('asset_loans').find({}).toArray(),
    db.collection('rma_cases').find({}).toArray(),
    db.collection('quarantine_items').find({}).toArray(),
  ]);
  const plan = buildRegistryPlan({ inventory, loans, rmaCases, quarantineItems });
  const summary = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    inventoryItemsScanned: inventory.length,
    assetsPlanned: plan.assets.length,
    duplicateSerials: plan.duplicateSerials,
    unknownReferences: plan.unknownReferences,
    stateConflicts: plan.stateConflicts,
    loansLinked: plan.loanLinks.length,
    rmaCasesLinked: plan.rmaLinks.length,
  };
  logger.table({
    mode: summary.mode,
    inventoryItemsScanned: summary.inventoryItemsScanned,
    assetsPlanned: summary.assetsPlanned,
    duplicateSerials: summary.duplicateSerials.length,
    unknownReferences: summary.unknownReferences.length,
    stateConflicts: summary.stateConflicts.length,
    loansLinked: summary.loansLinked,
    rmaCasesLinked: summary.rmaCasesLinked,
  });
  if (plan.duplicateSerials.length || plan.stateConflicts.length || plan.unknownReferences.length) {
    throw new Error('Serialized asset migration is blocked by duplicate serials, conflicting active states, or unknown references');
  }
  if (apply) {
    await applyPlan(db, client, plan);
  } else if (!apply) {
    logger.log(`No data changed. Re-run with --apply ${APPLY_TOKEN} only after separate authorization.`);
  }
  return summary;
}

async function main() {
  const uri = process.env.INVENTORY_AUDIT_MONGO_URI;
  if (!uri) throw new Error('INVENTORY_AUDIT_MONGO_URI must be supplied through the process environment');
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes(APPLY_TOKEN);
  await mongoose.connect(uri);
  return migrate({ db: mongoose.connection.db, client: mongoose.connection.getClient(), apply, confirmed });
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => mongoose.disconnect());
}

module.exports = { APPLY_TOKEN, buildRegistryPlan, migrate };
