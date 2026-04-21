require("dotenv").config();
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const paymentRoutes = require("./routes/payment.routes");
const inspectionTicketRoutes = require("./routes/inspectionTicket.routes");
const inspectionOfficerRoutes = require("./routes/inspectionOfficer.routes");
const invoiceRoutes = require("./routes/invoice.routes");
const servicePaymentRoutes = require("./routes/servicePayment.routes");
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// DB
connectDB();

// Routes
app.use("/api/payments", paymentRoutes);
app.use("/api/inspection-tickets", inspectionTicketRoutes);
app.use("/api/inspection-officer", inspectionOfficerRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/service-payments", servicePaymentRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ message: "API is running" }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
