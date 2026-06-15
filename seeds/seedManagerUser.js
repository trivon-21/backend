const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../src/models/User");

const MONGO_URI = process.env.MONGO_URI;

async function seedManagerUser() {
  try {
    const dnsServers = (process.env.MONGO_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",");
    dns.setServers(dnsServers);

    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB");

    const email = "manager@airlux.com";
    const password = "Password@123";
    const role = "MANAGER";

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`! User ${email} already exists. Updating password and role...`);
      const hashedPassword = await bcrypt.hash(password, 10);
      existingUser.passwordHash = hashedPassword;
      existingUser.role = role;
      await existingUser.save();
      console.log("✓ User updated successfully");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({
        fullName: "John",
        lastName: "Manager",
        email,
        passwordHash: hashedPassword,
        role,
        emailVerified: true,
        authMethods: ["email"]
      });
      await newUser.save();
      console.log(`✓ User ${email} created successfully`);
    }

    process.exit(0);
  } catch (error) {
    console.error("✗ Seeding failed:", error.message);
    process.exit(1);
  }
}

seedManagerUser();
