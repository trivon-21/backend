const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../src/config/db');

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueLookup(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = normalized(row[key]);
    if (!value) continue;
    const matches = grouped.get(value) || [];
    matches.push(row);
    grouped.set(value, matches);
  }
  return new Map([...grouped.entries()].filter(([, matches]) => matches.length === 1)
    .map(([value, matches]) => [value, matches[0]]));
}

async function migrate() {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const db = mongoose.connection.db;
  const [inventory, users, orders, loans] = await Promise.all([
    db.collection('inventory').find({}).project({ _id: 1, sku: 1 }).toArray(),
    db.collection('users').find({ role: { $in: ['MAIN_TECH', 'SERVICE_TEAM', 'INSPECTION'] } })
      .project({ _id: 1, fullName: 1 }).toArray(),
    db.collection('purchase_requests').find({}).toArray(),
    db.collection('asset_loans').find({}).toArray(),
  ]);

  const inventoryBySku = uniqueLookup(inventory, 'sku');
  const techniciansByName = uniqueLookup(users, 'fullName');
  const orderOperations = [];
  const loanOperations = [];
  const summary = {
    ordersScanned: orders.length,
    orderLinesLinked: 0,
    orderLinesAmbiguousOrMissing: 0,
    loansScanned: loans.length,
    loansLinked: 0,
    loansAmbiguousOrMissing: 0,
  };

  for (const order of orders) {
    let changed = false;
    const items = (order.items || []).map((line) => {
      if (line.inventoryId) return line;
      const inventoryItem = inventoryBySku.get(normalized(line.sku));
      if (!inventoryItem) {
        summary.orderLinesAmbiguousOrMissing += 1;
        return line;
      }
      changed = true;
      summary.orderLinesLinked += 1;
      return { ...line, inventoryId: inventoryItem._id };
    });
    if (changed) orderOperations.push({ updateOne: { filter: { _id: order._id }, update: { $set: { items } } } });
  }

  for (const loan of loans) {
    if (loan.technicianUserId) continue;
    const technician = techniciansByName.get(normalized(loan.technicianName));
    if (!technician) {
      summary.loansAmbiguousOrMissing += 1;
      continue;
    }
    summary.loansLinked += 1;
    loanOperations.push({
      updateOne: {
        filter: { _id: loan._id, technicianUserId: { $exists: false } },
        update: { $set: { technicianUserId: technician._id, technicianId: String(technician._id) } },
      },
    });
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} Manager/Inventory reference migration`);
  console.table(summary);
  if (apply) {
    if (orderOperations.length) await db.collection('purchase_requests').bulkWrite(orderOperations);
    if (loanOperations.length) await db.collection('asset_loans').bulkWrite(loanOperations);
  } else {
    console.log('No data was changed. Re-run the apply script after reviewing this summary.');
  }
  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
