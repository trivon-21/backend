const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntime, jobsEnabled } = require('../../src/config/runtime');
const valid = { JWT_SECRET: 'a'.repeat(32), MONGO_DB_NAME: 'airlux_demo_test', DEMO_MODE: 'true' };
test('startup rejects missing secrets and unsafe demo databases', () => {
  assert.throws(() => validateRuntime({}), /JWT_SECRET/);
  assert.throws(() => validateRuntime({ ...valid, MONGO_DB_NAME: 'airlux' }), /DEMO_MODE/);
  assert.doesNotThrow(() => validateRuntime(valid));
  assert.throws(() => validateRuntime({ ...valid, NODE_ENV: 'production' }), /MONGO_URI/);
  assert.throws(() => validateRuntime({ ...valid, NODE_ENV: 'production', MONGO_URI: 'mongodb://example' }), /FRONTEND_URL/);
});
test('jobs require explicit opt-in and stay disabled in demo/test', () => {
  assert.equal(jobsEnabled({}), false);
  assert.equal(jobsEnabled({ BACKGROUND_JOBS_ENABLED: 'true' }), true);
  assert.equal(jobsEnabled({ BACKGROUND_JOBS_ENABLED: 'true', DEMO_MODE: 'true' }), false);
  assert.equal(jobsEnabled({ BACKGROUND_JOBS_ENABLED: 'true', NODE_ENV: 'test' }), false);
});
test('importing the HTTP app never registers cron jobs; readiness and CORS work', async () => {
  process.env.DEMO_MODE = 'true';
  process.env.FRONTEND_URL = 'https://airlux.example';
  const cron = require('node-cron');
  const original = cron.schedule;
  let scheduled = 0;
  cron.schedule = () => { scheduled++; throw new Error('Unexpected cron registration'); };
  let server;
  try {
    const app = require('../../src/app');
    assert.equal(scheduled, 0);
    server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
    const url = `http://127.0.0.1:${server.address().port}`;
    let response = await fetch(`${url}/healthz`, { headers: { Origin: 'https://airlux.example' } });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://airlux.example');
    assert.deepEqual(await response.json(), { status: 'unavailable' });
    const mongoose = require('mongoose');
    const prior = mongoose.connection.readyState;
    mongoose.connection.readyState = 1;
    try { response = await fetch(`${url}/healthz`); assert.equal(response.status, 200); }
    finally { mongoose.connection.readyState = prior; }
    response = await fetch(`${url}/healthz`, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    cron.schedule = original;
    if (server) await new Promise(resolve => server.close(resolve));
  }
});
test('demo mail never contacts an SMTP server', async () => {
  process.env.DEMO_MODE = 'true';
  const result = await require('../../src/config/mailer').createTransport({ host: 'invalid.example' }).sendMail({
    from: 'demo@airlux.example', to: 'recipient@airlux.example', subject: 'Synthetic demo', text: 'No delivery',
  });
  assert.match(result.message, /Synthetic demo/);
});
