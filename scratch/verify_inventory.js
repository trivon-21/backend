const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const InventorySchema = new mongoose.Schema({}, { strict: false, collection: 'inventory' });
const Inventory = mongoose.model('Inventory', InventorySchema);

async function check() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/Dassana';
    await mongoose.connect(mongoUri);
    const count = await Inventory.countDocuments();
    console.log(`Total inventory items: ${count}`);
    const tools = await Inventory.countDocuments({ category: 'Tools' });
    const components = await Inventory.countDocuments({ category: 'Components' });
    const parts = await Inventory.countDocuments({ category: 'Parts' });
    console.log(`Tools: ${tools}, Components: ${components}, Parts: ${parts}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
