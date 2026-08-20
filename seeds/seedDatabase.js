const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Models
const User = require("../src/models/User");
const Product = require("../src/models/product.model");
const Order = require("../src/models/Order");
const InstallationOrder = require("../src/models/installationOrder.model");
const ServiceTicket = require("../src/modules/shared/serviceTicket/serviceTicket.model");
const Inquiry = require("../src/models/Inquiry");
const Feedback = require("../src/models/Feedback");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/airlux";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "airlux";

async function connectDB() {
  try {
    // Configure DNS servers to fix querySrv issues
    const dnsServers = (process.env.MONGO_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",");
    dns.setServers(dnsServers);

    await mongoose.connect(MONGO_URI, { dbName: MONGO_DB_NAME });
    console.log("✓ Connected to MongoDB");
  } catch (error) {
    console.error("✗ MongoDB connection error:", error.message);
    process.exit(1);
  }
}

async function clearCollections() {
  try {
    await User.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await InstallationOrder.deleteMany({});
    await ServiceTicket.deleteMany({});
    await Inquiry.deleteMany({});
    await Feedback.deleteMany({});
    console.log("✓ Cleared all collections");
  } catch (error) {
    console.error("✗ Error clearing collections:", error.message);
  }
}

async function seedUsers() {
  const hashedPassword = await bcrypt.hash("Password123!", 10);

  const users = [
    {
      _id: new mongoose.Types.ObjectId("6a86b68cf09ec22a4f0089c6"),
      fullName: "Ashen",
      lastName: "Perera",
      email: "admin@airlux.lk",
      phoneNumber: "+94770000000",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "Admin Office, Colombo",
      role: "SUPER_ADMIN",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68df09ec22a4f0089c8"),
      fullName: "Nadeesha",
      lastName: "Fernando",
      email: "nadeesha@example.com",
      phoneNumber: "+94770000002",
      passwordHash: hashedPassword,
      gender: "Female",
      address: "45 Negombo Road, Negombo",
      role: "CUSTOMER",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email", "phone"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68df09ec22a4f0089ca"),
      fullName: "Kasun",
      lastName: "Silva",
      email: "kasun@airlux.lk",
      phoneNumber: "+94772222222",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "Technician Hub, Galle",
      role: "MAIN_TECH",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68df09ec22a4f0089cc"),
      fullName: "Ishara",
      lastName: "Jayasuriya",
      email: "ishara@airlux.lk",
      phoneNumber: "+94773333333",
      passwordHash: hashedPassword,
      gender: "Female",
      address: "Finance Dept, Colombo",
      role: "FINANCE",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68df09ec22a4f0089ce"),
      fullName: "Ruwan",
      lastName: "Perera",
      email: "ruwan@airlux.lk",
      phoneNumber: "+94774444444",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "CSA Lounge, Kandy",
      role: "CSA",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68df09ec22a4f0089d0"),
      fullName: "Dilshan",
      lastName: "Silva",
      email: "dilshan@airlux.lk",
      phoneNumber: "+94775555555",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "Inspection Team Office, Colombo",
      role: "INSPECTION",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68df09ec22a4f0089d2"),
      fullName: "Nuwan",
      lastName: "Jayewardene",
      email: "nuwan@airlux.lk",
      phoneNumber: "+94776666666",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "Service HQ, Negombo",
      role: "SERVICE_TEAM",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68df09ec22a4f0089d4"),
      fullName: "Amal",
      lastName: "Perera",
      email: "amal@airlux.lk",
      phoneNumber: "+94777777777",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "Main Warehouse, Colombo",
      role: "INVENTORY",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68ef09ec22a4f0089d6"),
      fullName: "Priyantha",
      lastName: "Bandara",
      email: "priyantha@airlux.lk",
      phoneNumber: "+94778888888",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "Executive Suite, Colombo",
      role: "MANAGER",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"]
    }
  ];

  const createdUsers = await User.insertMany(users);
  console.log(`✓ Created ${createdUsers.length} users`);
  return createdUsers;
}

async function seedProducts() {
  const products = [
    {
      _id: new mongoose.Types.ObjectId("6a86b68ef09ec22a4f0089e2"),
      name: "Airlux SplitCool 12000BTU",
      description: "Inverter split-type air conditioner, energy efficient, ideal for medium rooms.",
      brand: "Airlux",
      category: "Split AC",
      image: "https://example.com/images/splitcool-12000.jpg",
      images: [],
      capacity: 12000,
      price: 145000,
      variants: [
        { capacity: 9000, price: 120000, label: "9000 BTU" },
        { capacity: 12000, price: 145000, label: "12000 BTU" },
        { capacity: 18000, price: 189000, label: "18000 BTU" }
      ],
      specs: [
        { key: "Energy Rating", value: "5 Star" },
        { key: "Refrigerant", value: "R32" }
      ],
      warrantyInfo: {
        comprehensive: "1 year",
        compressor: "5 years",
        covered: ["Compressor", "PCB"],
        notCovered: ["Physical damage", "Water damage"]
      },
      features: ["Inverter technology", "Low noise", "Wi-Fi ready"],
      inStock: true,
      averageRating: 0,
      reviewCount: 0,
      reviews: []
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68ef09ec22a4f0089e3"),
      name: "LG 2 Ton Window AC",
      description: "Window air conditioner with powerful cooling and dual rotor technology.",
      brand: "LG",
      category: "Window AC",
      image: "https://example.com/images/lg-window-2ton.jpg",
      images: [],
      capacity: 24000,
      price: 95000,
      variants: [],
      specs: [
        { key: "Energy Rating", value: "3 Star" },
        { key: "Refrigerant", value: "R22" }
      ],
      warrantyInfo: {
        comprehensive: "1 year",
        compressor: "10 years",
        covered: ["Compressor"],
        notCovered: ["Cabinet rust"]
      },
      features: ["Dual inverter", "Remote control", "Auto clean"],
      inStock: true,
      averageRating: 0,
      reviewCount: 0,
      reviews: []
    },
    {
      _id: new mongoose.Types.ObjectId("6a86b68ef09ec22a4f0089e4"),
      name: "Samsung 1.5 Ton Inverter AC",
      description: "Fast cooling digital inverter, copper condenser, antibacterial filter.",
      brand: "Samsung",
      category: "Split AC",
      image: "https://example.com/images/samsung-inverter-1.5.jpg",
      images: [],
      capacity: 18000,
      price: 165000,
      variants: [],
      specs: [
        { key: "Energy Rating", value: "4 Star" },
        { key: "Refrigerant", value: "R32" }
      ],
      warrantyInfo: {
        comprehensive: "2 years",
        compressor: "10 years",
        covered: ["Compressor", "Condenser coil"],
        notCovered: ["Plastic parts"]
      },
      features: ["Triple protector plus", "Easy filter plus", "Durafin"],
      inStock: true,
      averageRating: 0,
      reviewCount: 0,
      reviews: []
    }
  ];

  const createdProducts = await Product.insertMany(products);
  console.log(`✓ Created ${createdProducts.length} products`);
  return createdProducts;
}

async function seedOrders(users, products) {
  // Buy Only order (goes to Order model)
  const orderBO = {
    _id: new mongoose.Types.ObjectId("6a86b68ff09ec22a4f0089e6"),
    orderReference: "ALX-BO-0001",
    userId: users[1]._id,
    items: [
      {
        productId: products[0]._id,
        name: products[0].name,
        price: products[0].price,
        quantity: 1,
        purchaseType: "buy_only"
      }
    ],
    shippingDetails: {
      firstName: "Nadeesha",
      lastName: "Fernando",
      email: "nadeesha@example.com",
      phone: "+94770000002",
      address: "45 Negombo Road",
      city: "Negombo",
      postalCode: "11500"
    },
    subtotal: 145000,
    additionalCharges: 0,
    total: 145000,
    status: "Pending Payment",
    consultationCompleted: false
  };

  // Buy & Install order (goes to InstallationOrder model)
  const orderBI = {
    _id: new mongoose.Types.ObjectId("6a86b68ff09ec22a4f0089e8"),
    orderReference: "ALX-BI-0001",
    userId: users[1]._id,
    items: [
      {
        productId: products[0]._id,
        name: products[0].name,
        price: products[0].price,
        quantity: 1,
        purchaseType: "buy_and_install"
      }
    ],
    shippingDetails: {
      firstName: "Nadeesha",
      lastName: "Fernando",
      email: "nadeesha@example.com",
      phone: "+94770000002",
      address: "45 Negombo Road",
      city: "Negombo",
      postalCode: "11500"
    },
    subtotal: 145000,
    additionalCharges: 5000,
    total: 150000,
    status: "Awaiting Inspection",
    inspectionFee: 5000,
    consultationCompleted: false
  };

  const createdBO = await Order.create(orderBO);
  const createdBI = await InstallationOrder.create(orderBI);

  console.log("✓ Created 1 Order (Buy Only)");
  console.log("✓ Created 1 Installation Order (Buy & Install)");

  return { createdBO, createdBI };
}

async function seedServiceTickets(users) {
  const tickets = [
    {
      _id: new mongoose.Types.ObjectId("6a86b690f09ec22a4f0089fa"),
      customerId: users[1]._id, // Nadeesha Fernando
      requestType: "Maintenance",
      description: "Customer requested first free service after installation.",
      serviceFee: 0,
      category: "maintenance",
      priority: "medium",
      status: "Assigned",
      assignedTechnicianId: users[2]._id, // Kasun Silva (MAIN_TECH)
      slaDueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days from now
    },
    {
      customerId: users[1]._id,
      requestType: "Repair",
      description: "AC is cooling slowly and blowing warm air periodically.",
      serviceFee: 1500,
      category: "repair",
      priority: "high",
      status: "New"
    }
  ];

  const createdTickets = await ServiceTicket.insertMany(tickets);
  console.log(`✓ Created ${createdTickets.length} service tickets`);
  return createdTickets;
}

async function seedInquiries(users) {
  const inquiries = [
    {
      customer: users[1]._id,
      name: "Nadeesha Fernando",
      email: "nadeesha@example.com",
      phone: "+94770000002",
      inquiryType: "Product",
      message: "What are the energy efficiency ratings for the Airlux SplitCool models?",
      status: "Addressed",
      thread: [
        {
          sender: "Customer",
          message: "What are the energy efficiency ratings for the Airlux SplitCool models?"
        },
        {
          sender: "Support",
          message: "Our Airlux SplitCool models have 5-star energy ratings and utilize R32 eco-friendly refrigerant."
        }
      ]
    }
  ];

  const createdInquiries = await Inquiry.insertMany(inquiries);
  console.log(`✓ Created ${createdInquiries.length} inquiries`);
  return createdInquiries;
}

async function seedFeedback(users, orders, serviceTickets) {
  const feedback = [
    {
      customer: users[1]._id,
      feedbackFor: "Order",
      referenceId: orders.createdBO._id,
      referenceLabel: orders.createdBO.orderReference,
      productQuality: 5,
      technicianBehavior: 5,
      deliveryExperience: 4,
      comment: "Excellent buying experience. The SplitCool AC cools extremely fast."
    }
  ];

  const createdFeedback = await Feedback.insertMany(feedback);
  console.log(`✓ Created ${createdFeedback.length} feedback records`);
  return createdFeedback;
}

async function seedDatabase() {
  try {
    await connectDB();
    await clearCollections();

    const users = await seedUsers();
    const products = await seedProducts();
    const orders = await seedOrders(users, products);
    const serviceTickets = await seedServiceTickets(users);
    const inquiries = await seedInquiries(users);
    await seedFeedback(users, orders, serviceTickets);

    console.log("\n✓ Database seeded successfully!\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("SUPER ADMIN CREDENTIALS:");
    console.log("- Email: admin@airlux.lk");
    console.log("- Password: Password123!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nCUSTOMER CREDENTIALS:");
    console.log("- Email: nadeesha@example.com");
    console.log("- Password: Password123!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nAll collections populated with sample data!");

    process.exit(0);
  } catch (error) {
    console.error("✗ Seeding failed:", error.message);
    process.exit(1);
  }
}

seedDatabase();
