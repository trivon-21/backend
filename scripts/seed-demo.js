require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { validateRuntime } = require('../src/config/runtime');
async function seed() {
  validateRuntime();
  if (process.env.DEMO_MODE !== 'true' || !process.env.MONGO_DB_NAME.startsWith('airlux_demo')) {
    throw new Error('Seeding requires DEMO_MODE and an explicit airlux_demo database.');
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set DEMO_PASSWORD to at least 12 characters.');
  await require('../src/config/db')();
  const User = require('../src/models/User');
  const DispatchOrder = require('../src/models/DispatchOrder');
  const passwordHash = await bcrypt.hash(password, 12);
  for (const role of ['CUSTOMER', 'FINANCE', 'INVENTORY']) {
    const email = `${role.toLowerCase()}@airlux.example`;
    await User.updateOne({ email }, { $set: {
      fullName: `Airlux Demo ${role}`, role, passwordHash, emailVerified: true,
      isActive: true, loginAttempts: 0, lockUntil: null, needsPasswordChange: false,
    } }, { upsert: true });
  }
  for (const [index, status] of ['to-pack', 'ready', 'in-transit', 'completed'].entries()) {
    const orderId = `DEMO-DSP-${index + 1}`;
    await DispatchOrder.updateOne({ orderId }, { $setOnInsert: {
      orderId, customer: 'Synthetic Demo Customer', date: new Date().toISOString().slice(0, 10),
      type: 'Delivery', status, statusVersion: 0,
      items: [{ name: 'Demo Air Conditioner', sku: 'DEMO-AC-01', qty: 1, confirmed: status !== 'to-pack' }],
      ...(status === 'to-pack' ? {} : { courier: 'Demo Courier', trackId: `DEMO-TRACK-${index + 1}` }),
      ...(status === 'completed' ? { completedAt: new Date() } : {}),
    } }, { upsert: true });
  }
  console.log('Synthetic accounts and dispatch records ready. Password is the supplied DEMO_PASSWORD.');
}
seed().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
