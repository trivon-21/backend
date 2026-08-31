const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('dns');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const ENV_KEYS = [
  'MONGO_URI',
  'MONGODB_URI',
  'MONGO_DB_NAME',
  'MONGO_HOST',
  'MONGO_PORT',
  'MONGO_DNS_SERVERS',
];

async function withConnectionStubs(run) {
  const originalConnect = mongoose.connect;
  const originalSetServers = dns.setServers;
  const originalLog = console.log;
  const originalEnvironment = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  const calls = { connect: [], dnsServers: [], logs: [] };

  mongoose.connect = async (...args) => {
    calls.connect.push(args);
    return { connection: { host: 'stub-host', name: 'stub-database' } };
  };
  dns.setServers = (servers) => {
    calls.dnsServers.push(servers);
  };
  console.log = (...args) => {
    calls.logs.push(args);
  };

  for (const key of ENV_KEYS) delete process.env[key];

  try {
    await run(calls);
  } finally {
    mongoose.connect = originalConnect;
    dns.setServers = originalSetServers;
    console.log = originalLog;

    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('database module preserves its default and named compatibility exports', () => {
  assert.equal(connectDB.connectDB, connectDB);
  assert.equal(connectDB.connectDb, connectDB);
  assert.equal(typeof connectDB.normalizeMongoUri, 'function');
});

test('normalizeMongoUri replaces an explicit URI database path', async () => {
  await withConnectionStubs(async () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/existing-database';
    process.env.MONGO_DB_NAME = 'configured-database';

    assert.equal(
      connectDB.normalizeMongoUri(),
      'mongodb://localhost:27017/configured-database',
    );
  });
});

test('normalizeMongoUri replaces test with the default database and preserves options', async () => {
  await withConnectionStubs(async () => {
    process.env.MONGO_URI = 'mongodb+srv://cluster.example/test?retryWrites=true&w=majority';

    assert.equal(
      connectDB.normalizeMongoUri(),
      'mongodb+srv://cluster.example/airlux?retryWrites=true&w=majority',
    );
  });
});

test('normalizeMongoUri appends the configured database to a bare URI', async () => {
  await withConnectionStubs(async () => {
    process.env.MONGO_URI = 'mongodb://localhost:27017';
    process.env.MONGO_DB_NAME = 'configured-database';

    assert.equal(
      connectDB.normalizeMongoUri(),
      'mongodb://localhost:27017/configured-database',
    );
  });
});

test('normalizeMongoUri supports MONGODB_URI and local host fallbacks', async () => {
  await withConnectionStubs(async () => {
    process.env.MONGODB_URI = 'mongodb://alias-host:27017';
    assert.equal(connectDB.normalizeMongoUri(), 'mongodb://alias-host:27017/airlux');

    delete process.env.MONGODB_URI;
    process.env.MONGO_HOST = 'database-host';
    process.env.MONGO_PORT = '27018';
    process.env.MONGO_DB_NAME = 'host-database';
    assert.equal(connectDB.normalizeMongoUri(), 'mongodb://database-host:27018/host-database');
  });
});

test('normalizeMongoUri replaces a database path supplied through MONGO_HOST', async () => {
  await withConnectionStubs(async () => {
    process.env.MONGO_HOST = 'mongodb://database-host:27017/test?replicaSet=local';
    process.env.MONGO_DB_NAME = 'host-database';

    assert.equal(
      connectDB.normalizeMongoUri(),
      'mongodb://database-host:27017/host-database?replicaSet=local',
    );
  });
});

test('connectDB forwards normalized URI, DNS servers, and timeouts', async () => {
  await withConnectionStubs(async (calls) => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/configured-database';
    process.env.MONGO_DB_NAME = 'configured-database';
    process.env.MONGO_DNS_SERVERS = '9.9.9.9,149.112.112.112';

    await connectDB();

    assert.deepEqual(calls.dnsServers, [['9.9.9.9', '149.112.112.112']]);
    assert.deepEqual(calls.connect, [[
      'mongodb://localhost:27017/configured-database',
      {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      },
    ]]);
    assert.deepEqual(calls.logs, [[
      'MongoDB connected: stub-host / database: stub-database',
    ]]);
  });
});
