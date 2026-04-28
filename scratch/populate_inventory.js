const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const InventorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  type: { type: String, enum: ['Single', 'Bundle'], default: 'Single' },
  category: { type: String, required: true },
  brand: { type: String, required: true },
  available: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 },
  location: { type: String, default: 'Warehouse' },
  unit: { type: String, default: 'units' },
  reorderLevel: { type: Number, default: 10 },
  maxStockLevel: { type: Number, default: 100 },
  unitCost: { type: Number, default: 0 },
  isSerialized: { type: Boolean, default: false },
  serialNumbers: [{ type: String }],
  status: { type: String, enum: ['critical', 'warning', 'normal'], default: 'normal' },
}, { timestamps: true, collection: 'inventory' });

const Inventory = mongoose.model('Inventory', InventorySchema);

const acData = [
  // TOOLS
  {
    name: 'Vacuum Pump 5CFM',
    sku: 'TL-VAC-001',
    category: 'Tools',
    brand: 'Yellow Jacket',
    available: 15,
    unitCost: 350,
    isSerialized: true,
    serialNumbers: ['VP1001', 'VP1002', 'VP1003', 'VP1004', 'VP1005'],
    reorderLevel: 2
  },
  {
    name: 'Manifold Gauge Set R410A',
    sku: 'TL-GGE-001',
    category: 'Tools',
    brand: 'Fieldpiece',
    available: 25,
    unitCost: 180,
    isSerialized: true,
    serialNumbers: ['MG2001', 'MG2002', 'MG2003'],
    reorderLevel: 5
  },
  {
    name: 'Recovery Machine',
    sku: 'TL-REC-001',
    category: 'Tools',
    brand: 'Appion',
    available: 8,
    unitCost: 850,
    isSerialized: true,
    serialNumbers: ['RM3001', 'RM3002'],
    reorderLevel: 1
  },
  {
    name: 'Digital Anemometer',
    sku: 'TL-ANM-001',
    category: 'Tools',
    brand: 'Testo',
    available: 12,
    unitCost: 120,
    isSerialized: true,
    serialNumbers: ['AN4001', 'AN4002'],
    reorderLevel: 3
  },

  // COMPONENTS
  {
    name: 'Inverter Compressor 18k BTU',
    sku: 'CP-INV-18K',
    category: 'Components',
    brand: 'LG',
    available: 45,
    unitCost: 220,
    isSerialized: true,
    serialNumbers: ['LGC18001', 'LGC18002', 'LGC18003'],
    reorderLevel: 10
  },
  {
    name: 'Control PCB - Multi Split',
    sku: 'CP-PCB-MUL',
    category: 'Components',
    brand: 'Daikin',
    available: 20,
    unitCost: 150,
    isSerialized: true,
    serialNumbers: ['DKN8801', 'DKN8802'],
    reorderLevel: 5
  },
  {
    name: 'Step Motor 12V',
    sku: 'CP-MOT-STP',
    category: 'Components',
    brand: 'Panasonic',
    available: 100,
    unitCost: 25,
    isSerialized: false,
    reorderLevel: 20
  },

  // PARTS
  {
    name: 'Copper Pipe 1/4" (50ft)',
    sku: 'PR-CPP-14',
    category: 'Parts',
    brand: 'Mueller',
    available: 200,
    unit: 'rolls',
    unitCost: 85,
    isSerialized: false,
    reorderLevel: 30
  },
  {
    name: 'Refrigerant R32 (10kg)',
    sku: 'PR-GAS-R32',
    category: 'Parts',
    brand: 'Honeywell',
    available: 50,
    unit: 'cylinders',
    unitCost: 110,
    isSerialized: false,
    reorderLevel: 10
  },
  {
    name: 'Armaflex Insulation 1/2"',
    sku: 'PR-INS-12',
    category: 'Parts',
    brand: 'Armacell',
    available: 500,
    unit: 'meters',
    unitCost: 2.5,
    isSerialized: false,
    reorderLevel: 100
  },
  {
    name: 'Capacitor 45uF',
    sku: 'PR-CAP-45',
    category: 'Parts',
    brand: 'Titan',
    available: 150,
    unitCost: 12,
    isSerialized: false,
    reorderLevel: 50
  }
];

async function seed() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/Dassana';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear existing data (optional, but good for clean demo)
    // await Inventory.deleteMany({});
    
    for (const item of acData) {
      await Inventory.findOneAndUpdate(
        { sku: item.sku },
        item,
        { upsert: true, new: true }
      );
    }

    console.log('Successfully seeded inventory data');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seed();
