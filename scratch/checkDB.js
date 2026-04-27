const mongoose = require("mongoose");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGO_URI;

async function checkDatabase() {
  try {
    const dnsServers = (process.env.MONGO_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",");
    dns.setServers(dnsServers);

    await mongoose.connect(MONGO_URI);
    console.log(`✓ Connected to: ${mongoose.connection.name}`);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("Collections in database:");
    collections.forEach(c => console.log(`- ${c.name}`));

    process.exit(0);
  } catch (error) {
    console.error("✗ Database check failed:", error.message);
    process.exit(1);
  }
}

checkDatabase();
