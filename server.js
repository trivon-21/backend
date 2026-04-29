const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const connectDB = require("./src/config/db");
const initializeRoutes = require("./src/routes");
const { errorHandler } = require("./src/middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get("/", (req, res) => res.send("AirLux API running..."));

// Initialize all routes from modules
initializeRoutes(app);

// Error handling middleware (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    console.log("MongoDB connected successfully");
  })
  .catch((err) => {
    console.error("DB connection failed initially:", err.message);
    console.log("Server will continue to run in Offline mode.");
  });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
