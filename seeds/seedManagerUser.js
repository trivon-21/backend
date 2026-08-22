const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const connectDB = require("../src/config/db");
const User = require("../src/models/User");

async function seedManagerUser() {
  try {
    const email = process.env.SEED_MANAGER_EMAIL;
    const password = process.env.SEED_MANAGER_PASSWORD;
    const role = "MANAGER";

    if (!email || !password) {
      throw new Error("SEED_MANAGER_EMAIL and SEED_MANAGER_PASSWORD are required");
    }

    await connectDB();

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
