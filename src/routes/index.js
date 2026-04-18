/**
 * Routes Aggregator
 * Combines all module routes into one place for easy management
 */

const authRoutes = require("../modules/auth/auth.routes");
const customerRoutes = require("../modules/customer/customer.routes");

// Stub role routes with placeholders (to be expanded)
const technicianRoutes = require("../modules/technician/technician.routes");
const serviceTeamRoutes = require("../modules/service-team/service_team.routes");
const salesRoutes = require("../modules/sales/sales.routes");
const csaRoutes = require("../modules/csa/csa.routes");
const financeRoutes = require("../modules/finance/finance.routes");
const inspectionTeamRoutes = require("../modules/inspection-team/inspection_team.routes");
const inventoryManagerRoutes = require("../modules/inventory-manager/inventory_manager.routes");
const managerRoutes = require("../modules/manager/manager.routes");

/**
 * Initialize all routes on the app
 * @param {Express.Application} app
 */
function initializeRoutes(app) {
  // Public/Auth routes (no auth required for signup, forgot-password)
  app.use("/api/auth", authRoutes);

  // Customer routes (protected - customers only)
  app.use("/api/customer", customerRoutes);

  // Role-specific routes (protected - role restricted)
  app.use("/api/technician", technicianRoutes);
  app.use("/api/service-team", serviceTeamRoutes);
  app.use("/api/sales", salesRoutes);
  app.use("/api/csa", csaRoutes);
  app.use("/api/finance", financeRoutes);
  app.use("/api/inspection", inspectionTeamRoutes);
  app.use("/api/inventory", inventoryManagerRoutes);
  app.use("/api/manager", managerRoutes);

  console.log("✅ All routes initialized");
}

module.exports = initializeRoutes;
