const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('dns');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const ENV_KEYS = ['MONGO_URI', 'MONGO_DB_NAME', 'MONGO_DNS_SERVERS'];

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

test('connectDB requires MONGO_URI before configuring a connection', async () => {
  await withConnectionStubs(async (calls) => {
    process.env.MONGO_DB_NAME = 'airlux';

    await assert.rejects(connectDB(), /MONGO_URI is missing in \.env/);
    assert.equal(calls.connect.length, 0);
    assert.equal(calls.dnsServers.length, 0);
  });
});

test('connectDB requires MONGO_DB_NAME before configuring a connection', async () => {
  await withConnectionStubs(async (calls) => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/uri-database';

    await assert.rejects(connectDB(), /MONGO_DB_NAME is missing in \.env/);
    assert.equal(calls.connect.length, 0);
    assert.equal(calls.dnsServers.length, 0);
  });
});

test('connectDB forwards the configured database name, DNS servers, and timeouts', async () => {
  await withConnectionStubs(async (calls) => {
    process.env.MONGO_URI = 'mongodb://localhost:27017/uri-database';
    process.env.MONGO_DB_NAME = 'configured-database';
    process.env.MONGO_DNS_SERVERS = '9.9.9.9,149.112.112.112';

    await connectDB();

    assert.deepEqual(calls.dnsServers, [['9.9.9.9', '149.112.112.112']]);
    assert.deepEqual(calls.connect, [[
      'mongodb://localhost:27017/uri-database',
      {
        dbName: 'configured-database',
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      },
    ]]);
    assert.deepEqual(calls.logs, [[
      'MongoDB connected to database "configured-database"...',
    ]]);
  });
});
