const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function runMerge() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  const db = mongoose.connection.db;

  const inventoryCol = db.collection('inventory');
  const productsCol = db.collection('products');

  // Step 1: Create snapshot backups
  console.log('Step 1: Creating backup collections...');
  const invBackupCol = db.collection('inventory_backup_merge_safe');
  const prodBackupCol = db.collection('products_backup_merge_safe');

  await invBackupCol.deleteMany({});
  await prodBackupCol.deleteMany({});

  const allInventory = await inventoryCol.find({}).toArray();
  if (allInventory.length > 0) {
    await invBackupCol.insertMany(allInventory);
  }
  console.log(`Backed up ${allInventory.length} inventory documents to inventory_backup_merge_safe`);

  const allProducts = await productsCol.find({}).toArray();
  if (allProducts.length > 0) {
    await prodBackupCol.insertMany(allProducts);
  }
  console.log(`Backed up ${allProducts.length} products documents to products_backup_merge_safe`);

  // Step 2: Identify the 3 products
  console.log('Step 2: Loading products...');
  const prodLG = allProducts.find(p => p.name.includes('AirLux Premium Split AC') || p.brand === 'LG');
  const prodDaikin = allProducts.find(p => p.name.includes('Classic Window AC') || p.category === 'Window AC');
  const prodSamsung = allProducts.find(p => p.name.includes('Elegance Pro 5000') || p.brand === 'Samsung');

  if (!prodLG || !prodDaikin || !prodSamsung) {
    throw new Error('Could not find all 3 products in the products collection');
  }

  // Step 3: Identify the 3 inventory items
  console.log('Step 3: Loading target inventory AC items...');
  const invIndoor = allInventory.find(i => i.sku === 'EQP-SPL-IN-12K' || (i.category === 'AC Equipment' && i.name.includes('Indoor')));
  const invOutdoor = allInventory.find(i => i.sku === 'EQP-SPL-OUT-12K' || (i.category === 'AC Equipment' && i.name.includes('Outdoor')));
  const invCassette = allInventory.find(i => i.sku === 'EQP-CST-36K' || (i.category === 'AC Equipment' && i.name.includes('Cassette')));

  if (!invIndoor || !invOutdoor || !invCassette) {
    throw new Error('Could not find all 3 target AC Equipment items in the inventory collection');
  }

  // Helper to build merge payload
  function buildMergedPayload(invItem, prod) {
    return {
      // Overlapping fields: use values from products as requested
      name: prod.name,
      brand: prod.brand,
      capacityBtu: prod.capacity,
      capacity: prod.capacity,
      description: prod.description || invItem.description,
      unitCost: prod.price,
      price: prod.price,
      pricing: {
        costPerUnit: prod.price,
        profitMargin: 0,
        sellingPricePerUnit: prod.price,
      },
      // Catalog presentation fields
      image: prod.image,
      images: prod.images || [],
      specs: prod.specs || [],
      warrantyInfo: prod.warrantyInfo || {},
      features: prod.features || [],
      reviews: prod.reviews || [],
      averageRating: prod.averageRating || 0,
      reviewCount: prod.reviewCount || (prod.reviews ? prod.reviews.length : 0),
      inStock: true,
      // Inventory fields to preserve & ensure compatibility
      category: 'AC Equipment',
      itemClass: 'AC Equipment',
      subcategory: prod.category || invItem.subcategory || 'Split AC',
      systemType: prod.category === 'Window AC' ? 'Universal' : 'Split',
      updatedAt: new Date()
    };
  }

  // Step 4: Perform updates
  console.log('Step 4: Merging products into inventory items...');

  // Item 1: AirLux Premium Split AC - 1.5Ton (LG)
  const update1 = buildMergedPayload(invIndoor, prodLG);
  await inventoryCol.updateOne({ _id: invIndoor._id }, { $set: update1 });
  console.log(`Updated inventory ${invIndoor._id} (${invIndoor.sku}) -> "${update1.name}" (${update1.brand})`);

  // Item 2: Classic Window AC (Daikin)
  const update2 = buildMergedPayload(invOutdoor, prodDaikin);
  await inventoryCol.updateOne({ _id: invOutdoor._id }, { $set: update2 });
  console.log(`Updated inventory ${invOutdoor._id} (${invOutdoor.sku}) -> "${update2.name}" (${update2.brand})`);

  // Item 3: Elegance Pro 5000 (Samsung)
  const update3 = buildMergedPayload(invCassette, prodSamsung);
  // Also ensure available quantity has stock so it can be ordered, if available was 0
  if (invCassette.available === 0) {
    update3.available = 10;
    update3.status = 'normal';
  }
  await inventoryCol.updateOne({ _id: invCassette._id }, { $set: update3 });
  console.log(`Updated inventory ${invCassette._id} (${invCassette.sku}) -> "${update3.name}" (${update3.brand})`);

  // Step 5: Verify
  const verifyItems = await inventoryCol.find({ category: 'AC Equipment' }).toArray();
  console.log('\n=== MERGED INVENTORY AC ITEMS ===');
  verifyItems.forEach(item => {
    console.log(`- [${item.sku}] ${item.name} | Brand: ${item.brand} | Category: ${item.category} (${item.subcategory}) | Capacity: ${item.capacityBtu} BTU | Price: LKR ${item.price} | Image: ${item.image} | Available: ${item.available}`);
  });

  const totalCount = await inventoryCol.countDocuments({});
  console.log(`Total inventory items remaining: ${totalCount} (expected 42)`);

  await mongoose.disconnect();
  console.log('Merge completed successfully!');
}

runMerge().catch(err => {
  console.error('Merge failed:', err);
  process.exit(1);
});
