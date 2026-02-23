const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./src/config/db");
const authRoutes = require("./src/routes/auth.routes");
const profileRoutes = require("./src/routes/profile.routes");
const dashboardRoutes = require("./src/routes/dashboard.routes");
const orderRoutes = require("./src/routes/order.routes");
const serviceRequestRoutes = require("./src/routes/service-request.routes");
const inquiryRoutes = require("./src/routes/inquiry.routes");
const feedbackRoutes = require("./src/routes/feedback.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("AirLux API running..."));

app.use("/api/auth", authRoutes);
app.use("/api/user/profile", profileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/service-requests", serviceRequestRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/feedback", feedbackRoutes);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  });
