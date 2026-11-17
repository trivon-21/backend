require("dotenv").config();

const mongoose = require("mongoose");

const Repair = require("./modules/shared/repair/repair.model");

async function insertRepair() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB");

    const repair = await Repair.create({

      // =====================================================
      // REFERENCES
      // =====================================================

      serviceTicketId: new mongoose.Types.ObjectId(
        "6aa2712fc39378e0b0191fed"
      ),

      customerId: new mongoose.Types.ObjectId(
        "6a8eb2c9a307890da9c3fa8b"
      ),

      orderId: null,

      // =====================================================
      // REPAIR DETAILS
      // =====================================================

      repairType: "minor",

      materials: [
        {
          item: 'Copper Piping 1/4" (per meter)',
          quantity: 5
        }
      ],

      location: "20 Negombo Road, Wattala",

      notes: "",

      // =====================================================
      // STATUS
      // =====================================================

      status: "PENDING"

      // createdAt and updatedAt are automatically generated
    });

    console.log("\n========================================");
    console.log("REPAIR INSERTED SUCCESSFULLY");
    console.log("========================================");

    console.log("Repair ID       :", repair._id);
    console.log("Service Ticket  :", repair.serviceTicketId);
    console.log("Customer ID     :", repair.customerId);
    console.log("Order ID        :", repair.orderId);
    console.log("Repair Type     :", repair.repairType);
    console.log("Status          :", repair.status);
    console.log("Created At      :", repair.createdAt);
    console.log("Updated At      :", repair.updatedAt);

    console.log("========================================\n");

    await mongoose.disconnect();

    console.log("Disconnected from MongoDB");

  } catch (error) {
    console.error("\nERROR INSERTING REPAIR:");
    console.error(error);

    await mongoose.disconnect();
  }
}

insertRepair();