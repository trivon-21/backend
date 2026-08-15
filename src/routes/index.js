/**
 * Routes Aggregator
 * Combines all module routes into one place for easy management
 */

const authRoutes = require("../modules/auth/auth.routes");
const customerRoutes = require("../modules/customer/customer.routes");
const superAdminRoutes = require("../modules/super-admin/super-admin.routes");

// Stub role routes with placeholders (to be expanded)
const technicianRoutes = require("../modules/technician/technician.routes");
const serviceTeamRoutes = require("../modules/service-team/service_team.routes");
const salesRoutes = require("../modules/sales/sales.routes");
const csaRoutes = require("../modules/csa/csa.routes");
const financeRoutes = require("../modules/finance/finance.routes");
const inspectionTeamRoutes = require("../modules/inspection-team/inspection_team.routes");
const inventoryManagerRoutes = require("../modules/inventory-manager/inventory_manager.routes");
const managerRoutes = require("../modules/manager/manager.routes");

// Incoming Catalog/Checkout Routes
const authMockRoutes = require("./auth.routes");
const productRoutes = require("./product.routes");
const cartRoutes = require("./cart.routes");
const orderRoutes = require("./order.routes");
const bankDetailRoutes = require("./bankDetail.routes");
const cartScenarioRoutes = require("./cartScenario.routes");
const configRoutes = require("./config.routes");

/**
 * Initialize all routes on the app
 * @param {Express.Application} app
 */
function initializeRoutes(app) {
  // Public/Auth routes (no auth required for signup, forgot-password)
  app.use("/api/auth", authRoutes);
  app.use("/api/auth", authMockRoutes); // Mount mock auth routes sequentially

  // Catalog / Checkout / Scenario routes
  app.use("/api/products", productRoutes);
  app.use("/api/scenarios", cartScenarioRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/admin", bankDetailRoutes);
  app.use("/api/checkout", bankDetailRoutes);
  app.use("/api/config", configRoutes);

  // Super Admin routes (protected - super admin only)
  app.use("/api/super-admin", superAdminRoutes);

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

  console.log("All routes initialized");
}

module.exports = initializeRoutes;
