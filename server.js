require("dotenv").config();
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const paymentRoutes = require("./routes/payment.routes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// DB
connectDB();

// Routes
app.use("/api/payments", paymentRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ message: "API is running" }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));