const mongoose = require('mongoose');
const dns = require('dns');

function normalizeMongoUri() {
  const explicitUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (explicitUri && explicitUri.trim()) {
    try {
      const parsed = new URL(explicitUri.trim());
      if (parsed.pathname && parsed.pathname !== '/') {
        return explicitUri.trim();
      }
    } catch (err) {
      // Ignore URL parse failures for plain local connection strings.
    }

    const dbName = process.env.MONGO_DB_NAME || 'airlux';
    return explicitUri.trim().endsWith('/')
      ? `${explicitUri.trim()}${dbName}`
      : `${explicitUri.trim()}/${dbName}`;
  }

  const host = process.env.MONGO_HOST || 'localhost';
  const port = process.env.MONGO_PORT || '27017';
  const dbName = process.env.MONGO_DB_NAME || 'airlux';

  if (host.includes('mongodb://') || host.includes('mongodb+srv://')) {
    return host.endsWith('/') ? `${host}${dbName}` : `${host}/${dbName}`;
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
