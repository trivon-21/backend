require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose");
const Product = require("../models/product.model");

const seedProduct = {
  name: "AirLux Premium Split AC - 1.5 Ton",
  price: 125000,
  currency: "LKR",
  inStock: true,
  capacityOptions: [
    { label: "1.5 Ton", price: 125000 },
    { label: "2.0 Ton", price: 155000 },
  ],
  description:
    "Experience ultimate comfort with the AirLux Premium Split AC, featuring advanced inverter technology, energy efficient cooling, and smart climate control for your home or office.",
  features: [
    "5-Star Energy Efficiency Rating",
    "Inverter Technology for 40% energy savings",
    "Smart WiFi Control Compatible",
    "Anti-bacterial filter system",
  ],
  specifications: [
    { label: "Cooling Capacity", value: "1.5 Ton (18,000 BTU)" },
    { label: "Energy Efficiency", value: "5-Star Rated" },
    { label: "Power Consumption", value: "1.2 kW" },
    { label: "Refrigerant Type", value: "R32 Eco-friendly" },
    { label: "Noise Level", value: "28 dB (Indoor) / 48 dB (Outdoor)" },
    { label: "Air Flow", value: "650 m³/h" },
    { label: "Dimensions (Indoor)", value: "900 x 260 x 210 mm" },
    { label: "Dimensions (Outdoor)", value: "800 x 550 x 320 mm" },
    { label: "Warranty", value: "2 Years Comprehensive + 5 Years Compressor" },
  ],
  warrantyTerms: [
    {
      title: "Comprehensive Warranty (2 Years)",
      description: "Covers all parts and labor for manufacturing defects",
    },
    {
      title: "Compressor Warranty (5 Years)",
      description: "Extended coverage on the compressor unit",
    },
  ],
  warrantyCovered: [
    "Manufacturing defects",
    "Parts replacement",
    "Labor charges",
    "Annual free maintenance (first year)",
  ],
  warrantyNotCovered: [
    "Physical damage",
    "Improper installation",
    "Natural calamities",
    "Unauthorised repairs",
  ],
  images: [
    "/images/ac-main.png",
    "/images/ac-thumb-1.png",
    "/images/ac-thumb-2.png",
    "/images/ac-thumb-3.png",
  ],
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    await Product.deleteMany({});
    console.log("Cleared existing products");

    const created = await Product.create(seedProduct);
    console.log(`Seeded product: ${created.name} (_id: ${created._id})`);

    await mongoose.disconnect();
    console.log("Done. Disconnected.");
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  }
}

seed();
