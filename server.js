require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

// Register legacy shared model collections used by finance and reporting flows.
require("./src/modules/shared/L_installations.model");
require("./src/modules/shared/L_inventories.model");
require("./src/modules/shared/L_charges.model");
require("./src/modules/shared/L_sellingPrice.model");
require("./src/modules/shared/L_serviceReport.model");
require("./src/modules/shared/L_bankDetails.model");
require("./src/modules/shared/L_repair.model");
require("./src/modules/shared/L_purchaseRequest.model");

const connectDB = require("./src/config/db");
const initializeRoutes = require("./src/routes");
const { errorHandler } = require("./src/middleware/error.middleware");
const { maintenanceMiddleware } = require("./src/middleware/maintenance.middleware");
const { actionLoggingMiddleware } = require("./src/middleware/action-logging");
const { schedulePaymentAutoCancelJob } = require("./src/jobs/paymentAutoCancelJob");
const maintenanceNotificationService = require("./src/services/maintenance-notification.service");

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(actionLoggingMiddleware);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => res.send("AirLux API running..."));

// Preserve the existing finance endpoints while keeping the team route modules active.
const paymentRoutes = require("./src/modules/finance/payment.routes");
const inspectionTicketRoutes = require("./src/modules/finance/inspectionTicket.routes");
const inspectionOfficerRoutes = require("./src/modules/inspection-team/inspection.routes");
const invoiceRoutes = require("./src/modules/finance/invoice.routes");
const servicePaymentRoutes = require("./src/modules/finance/servicePayment.routes");
const auditLogRoutes = require("./src/modules/finance/auditLog.routes");
const financialReportRoutes = require("./src/modules/finance/financialReport.routes");
const purchaseRequestRoutes = require("./src/modules/finance/purchaseRequest.routes");

app.use("/api/payments", paymentRoutes);
app.use("/api/inspection-tickets", inspectionTicketRoutes);
app.use("/api/inspection-officer", inspectionOfficerRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/service-payments", servicePaymentRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/financial-report", financialReportRoutes);
app.use("/api/purchase-requests", purchaseRequestRoutes);

app.use(maintenanceMiddleware);
initializeRoutes(app);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

function scheduleScheduledMaintenanceStartWatcher() {
  const runCheck = async () => {
    try {
      await maintenanceNotificationService.processScheduledMaintenanceStartNotifications();
    } catch (error) {
      console.error("Scheduled maintenance start watcher failed:", error.message);
    }
  };

  runCheck();
  setInterval(runCheck, 60 * 1000);
}

connectDB()
  .then(() => {
    try {
      schedulePaymentAutoCancelJob();
      scheduleScheduledMaintenanceStartWatcher();
      console.log("Background jobs scheduled successfully");
    } catch (err) {
      console.warn("Warning: Could not schedule background jobs:", err.message);
    }

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  });
