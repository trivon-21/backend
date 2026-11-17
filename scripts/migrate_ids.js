require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  try {
    const uri = process.env.MONGO_URI.replace('/?', '/airlux?');
    await mongoose.connect(uri);
    console.log('Connected to DB');

    const db = mongoose.connection.db;
    const collections = ['service_tickets', 'repairs', 'installations', 'maintenances'];
    
    // Counter setup
    let reqCounter = await db.collection('counters').findOne({ _id: 'serviceRequestId' });
    let reqSeq = reqCounter ? Math.max(reqCounter.seq, 1000) : 1000;

    for (const collName of collections) {
      console.log(`Migrating ${collName}...`);
      const coll = db.collection(collName);
      const docs = await coll.find({ serviceRequestId: { $exists: false } }).toArray();
      
      for (const doc of docs) {
        reqSeq++;
        const newId = `SRQ-${reqSeq}`;
        await coll.updateOne({ _id: doc._id }, { $set: { serviceRequestId: newId } });
        console.log(`Updated ${collName} ${doc._id} with ${newId}`);
      }
    }
    await db.collection('counters').updateOne(
      { _id: 'serviceRequestId' },
      { $set: { seq: reqSeq } },
      { upsert: true }
    );

    let repCounter = await db.collection('counters').findOne({ _id: 'serviceReportId' });
    let repSeq = repCounter ? Math.max(repCounter.seq, 1000) : 1000;
    
    console.log(`Migrating service_reports...`);
    const reportsColl = db.collection('service_reports');
    const reports = await reportsColl.find({ serviceReportId: { $exists: false } }).toArray();
    for (const rep of reports) {
      repSeq++;
      const newRepId = `REP-${repSeq}`;
      await reportsColl.updateOne({ _id: rep._id }, { $set: { serviceReportId: newRepId } });
      console.log(`Updated service_reports ${rep._id} with ${newRepId}`);
    }
    await db.collection('counters').updateOne(
      { _id: 'serviceReportId' },
      { $set: { seq: repSeq } },
      { upsert: true }
    );

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}
migrate();
