const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const NewRequest = require('../src/modules/shared/serviceRequest/newRequest.model');
const Counter = require('../src/modules/shared/serviceRequest/counter.model');

const normalizeServiceType = (value) => {
  const serviceType = String(value || '').trim().toLowerCase();

  return serviceType === 'maintenance' ? 'Maintenance' : 'Repair';
};

const getSequenceNumber = (requestId, prefix) => {
  const raw = String(requestId || '');

  if (!raw.startsWith(prefix)) {
    return null;
  }

  const sequencePart = raw.slice(prefix.length);
  const sequenceNumber = Number(sequencePart);

  return Number.isInteger(sequenceNumber) ? sequenceNumber : null;
};

async function syncCounter(counterId, highestSequence) {
  await Counter.findOneAndUpdate(
    { _id: counterId },
    { $set: { seq: highestSequence } },
    { upsert: true, new: true }
  );
}

async function run() {
  await connectDB();

  const prefixByType = {
    Repair: { counterId: 'repairSeq', prefix: 'RS-' },
    Maintenance: { counterId: 'maintenanceSeq', prefix: 'MS-' }
  };

  const allRequests = await NewRequest.find({}).sort({ createdAt: 1, _id: 1 }).lean();
  const legacyRequests = allRequests.filter((request) => !String(request._id).startsWith('RS-') && !String(request._id).startsWith('MS-'));

  if (legacyRequests.length === 0) {
    console.log('No legacy NewRequests records found. Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  const highestSequenceByType = {
    Repair: 0,
    Maintenance: 0
  };

  for (const request of allRequests) {
    const serviceType = normalizeServiceType(request.serviceType || request.requestType || request.request_type);
    const { prefix } = prefixByType[serviceType];
    const sequenceNumber = getSequenceNumber(request._id, prefix);

    if (sequenceNumber && sequenceNumber > highestSequenceByType[serviceType]) {
      highestSequenceByType[serviceType] = sequenceNumber;
    }
  }

  let migratedCount = 0;

  for (const request of legacyRequests) {
    const serviceType = normalizeServiceType(request.serviceType || request.requestType || request.request_type);
    const { prefix } = prefixByType[serviceType];

    highestSequenceByType[serviceType] += 1;
    const nextTicketId = `${prefix}${String(highestSequenceByType[serviceType]).padStart(5, '0')}`;

    const replacement = {
      ...request,
      _id: nextTicketId,
      serviceType,
      requestType: serviceType
    };

    await NewRequest.collection.insertOne(replacement);
    await NewRequest.deleteOne({ _id: request._id });

    migratedCount += 1;
    console.log(`Migrated ${request._id} -> ${nextTicketId}`);
  }

  await syncCounter('repairSeq', highestSequenceByType.Repair);
  await syncCounter('maintenanceSeq', highestSequenceByType.Maintenance);

  console.log(`Migration complete. Updated ${migratedCount} legacy NewRequests record(s).`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error(disconnectError);
  }
  process.exit(1);
});