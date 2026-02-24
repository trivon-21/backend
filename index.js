require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const productRoutes = require("./routes/product.routes");

const app = express();

// Middleware
app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

// Routes
app.use("/api/products", productRoutes);

app.get("/", (req, res) => {
  res.send("AirLux Backend API is running!");
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
