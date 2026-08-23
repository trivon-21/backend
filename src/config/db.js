const mongoose = require('mongoose');
const dns = require('dns');

function useDatabaseName(uri, dbName) {
  const optionsStart = uri.indexOf('?');
  const connection = optionsStart === -1 ? uri : uri.slice(0, optionsStart);
  const options = optionsStart === -1 ? '' : uri.slice(optionsStart);
  const authorityStart = connection.indexOf('://');
  const pathStart = connection.indexOf('/', authorityStart + 3);
  const authority = pathStart === -1
    ? connection
    : connection.slice(0, pathStart);

  return `${authority}/${dbName}${options}`;
}

function normalizeMongoUri() {
  const explicitUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  const configuredDbName = process.env.MONGO_DB_NAME?.trim();
  const dbName = configuredDbName || 'airlux';

  if (explicitUri && explicitUri.trim()) {
    return useDatabaseName(explicitUri.trim(), dbName);
  }

  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';

  if (host.includes('mongodb://') || host.includes('mongodb+srv://')) {
    return useDatabaseName(host, dbName);
  }

  return `mongodb://${host}:${port}/${dbName}`;
}

async function connectDb() {
  const uri = normalizeMongoUri();

  if (!uri) throw new Error('MONGO_URI or MONGODB_URI is missing in .env');

  const dnsServers = (process.env.MONGO_DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',');

  try {
    dns.setServers(dnsServers);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    const dbName = conn.connection.name || process.env.MONGO_DB_NAME || 'airlux';
    console.log(`MongoDB connected: ${conn.connection.host} / database: ${dbName}`);
  } catch (err) {
    if (err.message && err.message.includes('querySrv ECONNREFUSED')) {
      console.error(
        'MongoDB SRV DNS lookup failed. Your network may be blocking SRV queries.\n' +
        'Try using the non-SRV connection string from MongoDB Atlas (standard connection option).\n' +
        'Or set MONGO_DNS_SERVERS environment variable with custom DNS servers.'
      );
    }
    throw err;
  }
}

module.exports = connectDb;
module.exports.connectDB = connectDb;
module.exports.connectDb = connectDb;
module.exports.normalizeMongoUri = normalizeMongoUri;
