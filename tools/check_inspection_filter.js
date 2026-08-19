const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });
const Inspection = require('../src/modules/shared/inspection/inspectionTicket.model');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    const financeApprovedRegex = /finance\W*approved/i;
    const dbQuery = { $nor: [{ status: financeApprovedRegex }] };
    const results = await Inspection.find(dbQuery).lean();
    console.log('Count with $nor exclusion:', results.length);

    const all = await Inspection.find().lean();
    console.log('Total count:', all.length);

    const target = await Inspection.findOne({ _id: '6a5228b9e2f7ca9f9b02ca0e' }).lean();
    console.log('Target doc status raw:', JSON.stringify(target.status));

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
