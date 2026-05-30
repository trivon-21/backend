const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./src/config/db");
const initializeRoutes = require("./src/routes");
const { errorHandler } = require("./src/middleware/error.middleware");
const { maintenanceMiddleware } = require("./src/middleware/maintenance.middleware");
const { actionLoggingMiddleware } = require("./src/middleware/action-logging");
const { schedulePaymentAutoCancelJob } = require("./src/jobs/paymentAutoCancelJob");
const maintenanceNotificationService = require("./src/services/maintenance-notification.service");

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(actionLoggingMiddleware);

app.get("/", (req, res) => res.send("AirLux API running..."));

// Apply maintenance middleware before routes (blocks requests during maintenance)
// SUPER_ADMIN users can bypass
app.use(maintenanceMiddleware);

// Initialize all routes from modules
initializeRoutes(app);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

function scheduleScheduledMaintenanceStartWatcher() {
  const runCheck = async () => {
    try {
      await maintenanceNotificationService.processScheduledMaintenanceStartNotifications();
    } catch (error) {
      console.error('Scheduled maintenance start watcher failed:', error.message);
    }
  };

  runCheck();
  setInterval(runCheck, 60 * 1000);
}

connectDB()
  .then(() => {
    // Schedule background jobs
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
