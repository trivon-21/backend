/**
 * Routes Aggregator
 * Combines all module routes into one place for easy management
 */

const authRoutes = require("../modules/auth/auth.routes");
const inventoryManagerRoutes = require("../modules/inventory-manager/inventory_manager.routes");

/**
 * Initialize all routes on the app
 * @param {Express.Application} app
 */
function initializeRoutes(app) {
  // Public/Auth routes
  app.use("/api/auth", authRoutes);

  // Inventory Manager routes
  app.use("/api/inventory", inventoryManagerRoutes);

  console.log("✅ Routes initialized (Auth & Inventory Manager only)");
}

module.exports = initializeRoutes;
