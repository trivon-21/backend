require("dotenv").config();

const mongoose = require("mongoose");
const InstallationOrder = require("./models/installationOrder.model");

async function insertInstallationOrder() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB");

    const installationOrder = await InstallationOrder.create({
      // =====================================================
      // ORDER REFERENCES
      // =====================================================

      orderReference: "ALX-BI-TEST02",

      orderId: "ALX-BI-TEST02-ID",

      // =====================================================
      // CUSTOMER
      // =====================================================

      userId: "6a8eb2c9a307890da9c3fa8b",

      // =====================================================
      // PRODUCT
      // =====================================================

      items: [
        {
          productId: "6a86b68ef09ec22a4f0089e2",
          name: "AirLux Premium Split AC - 1.5Ton",
          price: 125000,
          quantity: 1,
          purchaseType: "buy_and_install"
        }
      ],

      // =====================================================
      // SHIPPING DETAILS
      // =====================================================

      shippingDetails: {
        firstName: "Lamya",
        lastName: "Nijardeen",
        email: "lamyanijardeen@gmail.com",
        phone: "",
        address: "20 Negombo Road, Wattala",
        city: "Wattala",
        postalCode: ""
      },

      // =====================================================
      // PRICE DETAILS
      // =====================================================

      subtotal: 125000,

      additionalCharges: 0,

      total: 125000,

      // =====================================================
      // INSTALLATION ORDER STATUS
      // =====================================================

      status: "Pending Review",

      inspectionFee: 0,

      // =====================================================
      // PAYMENT
      // =====================================================

      paymentSlip: "",

      paymentSlipUrl: "",

      paymentStatus: "Pending",

      // =====================================================
      // OTHER
      // =====================================================

      consultationCompleted: false

      // createdAt and updatedAt are automatically created
      // because your schema has { timestamps: true }
    });

    console.log("\n========================================");
    console.log("INSTALLATION ORDER INSERTED");
    console.log("========================================");

    console.log("MongoDB ID :", installationOrder._id);
    console.log("Order Ref  :", installationOrder.orderReference);
    console.log("Order ID   :", installationOrder.orderId);
    console.log("User ID    :", installationOrder.userId);
    console.log("Product    :", installationOrder.items[0].productId);
    console.log("Status     :", installationOrder.status);
    console.log("Total      :", installationOrder.total);
    console.log("Created At :", installationOrder.createdAt);
    console.log("Updated At :", installationOrder.updatedAt);

    console.log("========================================\n");

    await mongoose.disconnect();

    console.log("Disconnected from MongoDB");

  } catch (error) {
    console.error("\nERROR INSERTING INSTALLATION ORDER:");
    console.error(error);

    await mongoose.disconnect();
  }
}

insertInstallationOrder();