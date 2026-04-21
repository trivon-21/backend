const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const dns = require("dns");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Models
const User = require("../src/models/User");
const Order = require("../src/models/Order");
const ServiceRequest = require("../src/models/ServiceRequest");
const Inquiry = require("../src/models/Inquiry");
const Feedback = require("../src/models/Feedback");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/airlux";

async function connectDB() {
  try {
    // Configure DNS servers to fix querySrv issues
    const dnsServers = (process.env.MONGO_DNS_SERVERS || "8.8.8.8,1.1.1.1").split(",");
    dns.setServers(dnsServers);

    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB");
  } catch (error) {
    console.error("✗ MongoDB connection error:", error.message);
    process.exit(1);
  }
}

async function clearCollections() {
  try {
    await User.deleteMany({});
    await Order.deleteMany({});
    await ServiceRequest.deleteMany({});
    await Inquiry.deleteMany({});
    await Feedback.deleteMany({});
    console.log("✓ Cleared all collections");
  } catch (error) {
    console.error("✗ Error clearing collections:", error.message);
  }
}

async function seedUsers() {
  const hashedPassword = await bcrypt.hash("Test@123456", 10);

  const users = [
    {
      fullName: "Super",
      lastName: "Admin",
      email: "admin@example.com",
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
      fullName: "John",
      lastName: "Doe",
      email: "john@example.com",
      phoneNumber: "+94771234567",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "123 Main Street, Colombo",
      role: "CUSTOMER",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email", "phone"]
    },
    {
      fullName: "Sarah",
      lastName: "Johnson",
      email: "sarah@example.com",
      phoneNumber: "+94772345678",
      passwordHash: hashedPassword,
      gender: "Female",
      address: "456 Oak Avenue, Kandy",
      role: "CUSTOMER",
      emailVerified: true,
      phoneVerified: true,
      authMethods: ["email"],
      additionalEmails: [
        {
          email: "sarah.work@example.com",
          verified: true,
          addedAt: new Date()
        }
      ]
    },
    {
      fullName: "Michael",
      lastName: "Smith",
      email: "michael@example.com",
      phoneNumber: "+94773456789",
      passwordHash: hashedPassword,
      gender: "Male",
      address: "789 Pine Road, Galle",
      role: "CUSTOMER",
      emailVerified: true,
      phoneVerified: false,
      authMethods: ["phone"]
    }
  ];

  const createdUsers = await User.insertMany(users);
  console.log(`✓ Created ${createdUsers.length} users`);
  return createdUsers;
}

async function seedOrders(users) {
  const orders = [
    {
      customer: users[1]._id,
      itemName: "Daikin 1.5 Ton Air Conditioner",
      productImage: "https://via.placeholder.com/300x300?text=Daikin",
      quantity: 1,
      amount: 45000,
      paymentStatus: "Confirmed",
      orderType: "Buy & Install",
      orderStatus: "Delivered",
      status: "Pending",
      deliveryTrackingId: "DL123456789",
      warrantyStart: new Date("2024-04-04"),
      warrantyExpiry: new Date("2026-04-04"),
      amcStatus: "Active"
    },
    {
      customer: users[1]._id,
      itemName: "LG 2 Ton Window AC",
      productImage: "https://via.placeholder.com/300x300?text=LG",
      quantity: 2,
      amount: 32000,
      paymentStatus: "Under Review",
      orderType: "Buy Only",
      orderStatus: "Payment Uploaded",
      status: "Pending",
      paymentSlipUrl: "https://via.placeholder.com/300x300?text=Receipt"
    },
    {
      customer: users[2]._id,
      itemName: "Hitachi 1 Ton Split AC",
      productImage: "https://via.placeholder.com/300x300?text=Hitachi",
      quantity: 1,
      amount: 38000,
      paymentStatus: "Confirmed",
      orderType: "Buy & Install",
      orderStatus: "Installation Completed",
      status: "Completed",
      deliveryTrackingId: "DL987654321",
      warrantyStart: new Date("2023-06-15"),
      warrantyExpiry: new Date("2025-06-15"),
      amcStatus: "Expired"
    },
    {
      customer: users[2]._id,
      itemName: "Voltas 1.5 Ton AC Unit",
      productImage: "https://via.placeholder.com/300x300?text=Voltas",
      quantity: 1,
      amount: 28000,
      paymentStatus: "Pending Payment",
      orderType: "Buy Only",
      orderStatus: "Order Placed",
      status: "Pending"
    },
    {
      customer: users[3]._id,
      itemName: "Samsung 1.5 Ton Inverter AC",
      productImage: "https://via.placeholder.com/300x300?text=Samsung",
      quantity: 1,
      amount: 52000,
      paymentStatus: "Confirmed",
      orderType: "Buy & Install",
      orderStatus: "Installation Scheduled",
      status: "Pending",
      deliveryTrackingId: "DL555666777",
      warrantyStart: new Date("2024-03-20"),
      warrantyExpiry: new Date("2026-03-20"),
      amcStatus: "Active"
    }
  ];

  const createdOrders = await Order.insertMany(orders);
  console.log(`✓ Created ${createdOrders.length} orders`);
  return createdOrders;
}

async function seedServiceRequests(users, orders) {
  const serviceRequests = [
    {
      customer: users[1]._id,
      acUnitModel: "Daikin FTKA50TV",
      acUnitSerial: "DK001234567",
      acWarrantyStatus: "Active",
      acAmcStatus: "Active",
      serviceType: "General Service",
      problemDescription: "AC is making noise during operation",
      preferredDate: new Date("2024-04-15"),
      preferredTimeSlot: "10:00 AM - 12:00 PM",
      estimatedCharges: 1500,
      paymentRequired: false,
      status: "Assigned"
    },
    {
      customer: users[1]._id,
      acUnitModel: "LG LSA3NK",
      acUnitSerial: "LG567890123",
      acWarrantyStatus: "Active",
      acAmcStatus: "Not Active",
      serviceType: "Gas Refill",
      problemDescription: "AC is not cooling properly",
      preferredDate: new Date("2024-04-20"),
      preferredTimeSlot: "02:00 PM - 04:00 PM",
      estimatedCharges: 2500,
      paymentRequired: true,
      status: "Pending"
    },
    {
      customer: users[2]._id,
      acUnitModel: "Hitachi RMAS512HBEA",
      acUnitSerial: "HT111222333",
      acWarrantyStatus: "Expired",
      acAmcStatus: "Not Active",
      serviceType: "Repair",
      problemDescription: "Compressor is not working",
      preferredDate: new Date("2024-04-10"),
      preferredTimeSlot: "09:00 AM - 11:00 AM",
      estimatedCharges: 5000,
      paymentRequired: true,
      status: "In Progress"
    },
    {
      customer: users[3]._id,
      acUnitModel: "Samsung AR18NV3HEWK",
      acUnitSerial: "SM444555666",
      acWarrantyStatus: "Active",
      acAmcStatus: "Active",
      serviceType: "AMC Service",
      problemDescription: "Regular maintenance and cleaning",
      preferredDate: new Date("2024-04-25"),
      preferredTimeSlot: "11:00 AM - 01:00 PM",
      estimatedCharges: 0,
      paymentRequired: false,
      status: "Pending"
    },
    {
      customer: users[3]._id,
      acUnitModel: "Voltas 185 DXM",
      acUnitSerial: "VT777888999",
      acWarrantyStatus: "Unknown",
      acAmcStatus: "Not Active",
      serviceType: "Installation Issue",
      problemDescription: "Unit is vibrating excessively after installation",
      preferredDate: new Date("2024-04-12"),
      preferredTimeSlot: "03:00 PM - 05:00 PM",
      estimatedCharges: 1000,
      paymentRequired: false,
      status: "Completed"
    }
  ];

  const createdServiceRequests = await ServiceRequest.insertMany(serviceRequests);
  console.log(`✓ Created ${createdServiceRequests.length} service requests`);
  return createdServiceRequests;
}

async function seedInquiries(users) {
  const inquiries = [
    {
      customer: users[1]._id,
      name: "John Doe",
      email: "john@example.com",
      phone: "0771234567",
      inquiryType: "Product",
      message: "What are the energy efficiency ratings for the Daikin models?",
      status: "Addressed",
      thread: [
        {
          sender: "Customer",
          message: "What are the energy efficiency ratings for the Daikin models?"
        },
        {
          sender: "Support",
          message: "Our Daikin models have 5-star energy ratings. They consume 30% less power compared to standard models."
        },
        {
          sender: "Customer",
          message: "That's great! Can I get more details about warranty coverage?"
        },
        {
          sender: "Support",
          message: "Warranty covers compressor failure, refrigerant leaks, and electrical malfunctions for 2 years. Extended warranty available for 3-5 years."
        }
      ]
    },
    {
      customer: users[2]._id,
      name: "Sarah Johnson",
      email: "sarah@example.com",
      phone: "0772345678",
      inquiryType: "Installation",
      message: "Do you provide installation service in Kandy area?",
      status: "Ongoing",
      thread: [
        {
          sender: "Customer",
          message: "Do you provide installation service in Kandy area?"
        },
        {
          sender: "Support",
          message: "Yes, we provide installation services across Sri Lanka including Kandy. Average installation time is 2-3 hours."
        }
      ]
    },
    {
      customer: users[3]._id,
      name: "Michael Smith",
      email: "michael@example.com",
      phone: "0773456789",
      inquiryType: "Warranty",
      message: "How does the warranty claim process work?",
      status: "Closed",
      thread: [
        {
          sender: "Customer",
          message: "How does the warranty claim process work?"
        },
        {
          sender: "Support",
          message: "1. Contact us with your invoice and issue details. 2. We'll schedule a free diagnosis. 3. If covered by warranty, we'll repair/replace at no cost."
        },
        {
          sender: "Customer",
          message: "Thank you, that's clear!"
        },
        {
          sender: "Support",
          message: "You're welcome! Feel free to reach out if you have any other questions."
        }
      ]
    },
    {
      customer: users[1]._id,
      name: "John Doe",
      email: "john@example.com",
      phone: "0771234567",
      inquiryType: "AMC",
      message: "What's included in the AMC package?",
      status: "Ongoing",
      thread: [
        {
          sender: "Customer",
          message: "What's included in the AMC package?"
        },
        {
          sender: "Support",
          message: "AMC includes 2 free services per year, 24/7 breakdown support, and discounted parts replacement."
        }
      ]
    }
  ];

  const createdInquiries = await Inquiry.insertMany(inquiries);
  console.log(`✓ Created ${createdInquiries.length} inquiries`);
  return createdInquiries;
}

async function seedFeedback(users, orders, serviceRequests) {
  const feedback = [
    {
      customer: users[1]._id,
      feedbackFor: "Order",
      referenceId: orders[0]._id,
      referenceLabel: orders[0].orderRef,
      productQuality: 5,
      technicianBehavior: 5,
      deliveryExperience: 4,
      comment: "Excellent product! The AC is very quiet and cools perfectly. Delivery was on time.",
      imageUrl: "https://via.placeholder.com/300x300?text=Review"
    },
    {
      customer: users[1]._id,
      feedbackFor: "Installation",
      referenceId: orders[0]._id,
      referenceLabel: orders[0].orderRef,
      technicianBehavior: 5,
      serviceQuality: 5,
      comment: "Professional installation team. They were courteous and cleaned up after installation.",
      imageUrl: "https://via.placeholder.com/300x300?text=Installation"
    },
    {
      customer: users[1]._id,
      feedbackFor: "Service",
      referenceId: serviceRequests[0]._id,
      referenceLabel: serviceRequests[0].serviceRequestRef,
      serviceQuality: 4,
      technicianBehavior: 4,
      comment: "Good service. Technician identified the noise issue and fixed it quickly."
    },
    {
      customer: users[2]._id,
      feedbackFor: "Order",
      referenceId: orders[2]._id,
      referenceLabel: orders[2].orderRef,
      productQuality: 4,
      technicianBehavior: 5,
      deliveryExperience: 5,
      comment: "Great experience overall. Product is as described. Delivery and installation were smooth.",
      imageUrl: "https://via.placeholder.com/300x300?text=Satisfied"
    },
    {
      customer: users[3]._id,
      feedbackFor: "AMC Service Visit",
      referenceId: serviceRequests[3]._id,
      referenceLabel: serviceRequests[3].serviceRequestRef,
      serviceQuality: 5,
      technicianBehavior: 5,
      comment: "Very thorough preventive maintenance. The technician explained everything clearly."
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
    const orders = await seedOrders(users);
    const serviceRequests = await seedServiceRequests(users, orders);
    const inquiries = await seedInquiries(users);
    const feedback = await seedFeedback(users, orders, serviceRequests);

    console.log("\n✓ Database seeded successfully!\n");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("SUPER ADMIN CREDENTIALS:");
    console.log("- Email: admin@example.com");
    console.log("- Password: Test@123456");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nCUSTOMER CREDENTIALS:");
    console.log("- Email: john@example.com (Phone: 0771234567)");
    console.log("- Email: sarah@example.com (Phone: 0772345678)");
    console.log("- Email: michael@example.com (Phone: 0773456789)");
    console.log("- Password: Test@123456 (all users)");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\nAll collections populated with sample data!");

    process.exit(0);
  } catch (error) {
    console.error("✗ Seeding failed:", error.message);
    process.exit(1);
  }
}

seedDatabase();
