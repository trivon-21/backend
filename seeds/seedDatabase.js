const path = require('path');
const dotenv = require('dotenv');

const { connectDb } = require('../src/config');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const runSeed = async () => {
  await connectDb();
  console.log('Database seed entrypoint ready. Add seed logic here.');
  process.exit(0);
};

runSeed().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});
