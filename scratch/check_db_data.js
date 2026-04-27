const mongoose = require('mongoose');
require('dotenv').config();
const Inventory = require('../src/models/Inventory');
const Activity = require('../src/models/Activity');

const checkData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('--- Inventory ---');
    const inv = await Inventory.find().lean();
    console.log(JSON.stringify(inv, null, 2));

    console.log('\n--- Activities ---');
    const act = await Activity.find().lean();
    console.log(JSON.stringify(act, null, 2));

    mongoose.connection.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

checkData();
