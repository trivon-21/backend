require("dotenv").config();

const mongoose = require("mongoose");

const Installation = require("./modules/shared/installation/installation.model");

async function insertInstallation() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB");

    const installation = await Installation.create({
      // =====================================================
      // REFERENCES
      // =====================================================

      orderId: new mongoose.Types.ObjectId(
        "6a911fb3009f12531159e810"
      ),

      inspectionTicketId: new mongoose.Types.ObjectId(
        "6a9120092114920bb82776cd"
      ),

      customerId: new mongoose.Types.ObjectId(
        "6a8eb2c9a307890da9c3fa8b"
      ),

      // =====================================================
      // TECHNICIAN / TEAM
      // =====================================================

      assignedTeamId: null,

      assignedTeamName: "",

      // =====================================================
      // INSTALLATION DETAILS
      // =====================================================

      productType: "Split AC",

      units: 1,

      location: "20 Negombo Road, Wattala",

      serviceDate: null,

      // =====================================================
      // SITE DETAILS
      // =====================================================

      siteDetails: {
        buildingType: "Residential",
        floors: 1,
        rooms: 1,
        ceilingHeight: "",
        wallType: "",
        powerSupply: "",
        outdoorAccess: true
      },

      // =====================================================
      // MATERIALS
      // =====================================================

      materials: [
        {
          item: 'Copper Piping 1/4" (per meter)',
          quantity: 5
        }
      ],

      // =====================================================
      // FINANCE
      // =====================================================

      financeNotes: "",

      // =====================================================
      // STATUS
      // =====================================================

      status: "Pending"

      // createdAt and updatedAt are automatically generated
    });

    console.log("\n========================================");
    console.log("INSTALLATION INSERTED SUCCESSFULLY");
    console.log("========================================");

    console.log("Installation ID :", installation._id);
    console.log("Order ID        :", installation.orderId);
    console.log("Inspection ID   :", installation.inspectionTicketId);
    console.log("Customer ID     :", installation.customerId);
    console.log("Product Type    :", installation.productType);
    console.log("Units           :", installation.units);
    console.log("Status          :", installation.status);
    console.log("Created At      :", installation.createdAt);
    console.log("Updated At      :", installation.updatedAt);

    console.log("========================================\n");

    await mongoose.disconnect();

    console.log("Disconnected from MongoDB");

  } catch (error) {
    console.error("\nERROR INSERTING INSTALLATION:");
    console.error(error);

    await mongoose.disconnect();
  }
}

insertInstallation();