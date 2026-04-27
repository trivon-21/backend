// L_ Collections — register models
require("./src/modules/shared/L_installations.model");
require("./src/modules/shared/L_inventories.model");
require("./src/modules/shared/L_charges.model");
require("./src/modules/shared/L_sellingPrice.model");
require("./src/modules/shared/L_serviceReport.model");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");   // adjust path if db.js moved

const app = express();

// ── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Database ────────────────────────────────────────────
connectDB();

// ── Routes ──────────────────────────────────────────────
const paymentRoutes = require("./src/modules/finance/payment.routes");
const inspectionTicketRoutes = require("./src/modules/finance/inspectionTicket.routes");
const inspectionOfficerRoutes = require("./src/modules/inspection-team/inspection.routes");
const invoiceRoutes = require("./src/modules/finance/invoice.routes");
const servicePaymentRoutes = require("./src/modules/finance/servicePayment.routes");
const auditLogRoutes = require("./src/modules/finance/auditLog.routes");
const financialReportRoutes = require("./src/modules/finance/financialReport.routes");

app.use("/api/payments", paymentRoutes);
app.use("/api/inspection-tickets", inspectionTicketRoutes);
app.use("/api/inspection-officer", inspectionOfficerRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/service-payments", servicePaymentRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/financial-report", financialReportRoutes);

// ── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});