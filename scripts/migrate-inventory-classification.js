const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../src/config/db');
const Inventory = require('../src/models/Inventory');
const Supplier = require('../src/models/Supplier');
const {
  LEGACY_CLASS_MAP,
  INVENTORY_LOCATIONS,
  classifyLegacyItem,
  legacyStockStatus
} = require('../src/utils/inventory-domain');

async function migrate() {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const rawItems = await Inventory.collection.find({}).toArray();
  const suppliers = await Supplier.find().select('_id name').lean();
  const supplierByName = new Map(suppliers.map((supplier) => [supplier.name.trim(), supplier._id]));
  const operations = [];
  const summary = { scanned: rawItems.length, changed: 0, mapped: 0, unclassified: 0, suppliersLinked: 0 };

  for (const item of rawItems) {
    const mappedClass = LEGACY_CLASS_MAP[item.category];
    const itemClass = classifyLegacyItem(item.category, item.itemClass);
    const update = {
      itemClass,
      category: itemClass,
      subcategory: item.subcategory || 'Unclassified',
      type: item.type || 'Single',
      unit: item.unit || 'units',
      location: item.location || INVENTORY_LOCATIONS[0].warehouse,
      binLocation: item.binLocation || INVENTORY_LOCATIONS[0].placementAreas[0],
      maxStockLevel: item.maxStockLevel ?? Math.max(100, Number(item.reorderLevel || 0)),
      status: legacyStockStatus(item.available, item.reorderLevel)
    };

    if (!item.supplierId && item.supplierName && supplierByName.has(item.supplierName.trim())) {
      update.supplierId = supplierByName.get(item.supplierName.trim());
      summary.suppliersLinked++;
    }
    if (mappedClass) summary.mapped++;
    if (itemClass === 'Unclassified') summary.unclassified++;

    const changed = Object.entries(update).some(([key, value]) => String(item[key] ?? '') !== String(value ?? ''));
    if (changed) {
      summary.changed++;
      operations.push({ updateOne: { filter: { _id: item._id }, update: { $set: update } } });
    }
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} inventory classification migration`);
  console.table(summary);
  if (apply && operations.length) {
    const result = await Inventory.bulkWrite(operations);
    console.log(`Updated ${result.modifiedCount} inventory records.`);
  } else if (!apply) {
    console.log('No data was changed. Re-run with --apply after reviewing this summary.');
  }
  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
