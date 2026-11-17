const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { validateRuntime } = require('./config/runtime');

async function startServer() {
  validateRuntime();
  // Register legacy shared model collections used by finance and reporting flows.
  require('./modules/shared/L_installations.model');
  require('./modules/shared/L_inventories.model');
  require('./modules/shared/L_charges.model');
  require('./modules/shared/L_sellingPrice.model');
  require('./modules/shared/L_serviceReport.model');
  require('./modules/shared/L_bankDetails.model');
  require('./modules/shared/L_repair.model');
  require('./models/PurchaseRequest');

  const app = require('./app');
  const mongoose = require('mongoose');
  await require('./config/db')();
  const stopJobs = require('./jobs').startBackgroundJobs();
  const server = app.listen(process.env.PORT || 5000, '0.0.0.0', () => console.log('Airlux API listening'));
  const shutdown = () => {
    stopJobs();
    server.close(() => mongoose.disconnect().catch(console.error));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}
if (require.main === module) {
  startServer().catch(error => { console.error('Server startup failed:', error.message); process.exitCode = 1; });
}
module.exports = { startServer };
