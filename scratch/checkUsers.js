const mongoose = require("mongoose");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../src/models/User");

const MONGO_URI = process.env.MONGO_URI;

async function checkUsers() {
  try {
    const dnsServers = (process.env.MONGO_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",");
    dns.setServers(dnsServers);

    await mongoose.connect(MONGO_URI);
    console.log(`✓ Connected to: ${mongoose.connection.name}`);

    const count = await User.countDocuments();
    console.log(`Total users in 'users' collection: ${count}`);

    if (count > 0) {
      const users = await User.find({}, { email: 1, role: 1, fullName: 1 }).limit(5);
      console.log("Sample users:");
      users.forEach(u => console.log(`- ${u.fullName} (${u.email}) [${u.role}]`));
    }

    process.exit(0);
  } catch (error) {
    console.error("✗ Database check failed:", error.message);
    process.exit(1);
  }
}

checkUsers();
