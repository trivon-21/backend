const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const Maintenance = require("./modules/shared/maintenance/maintenance.model");

async function insertMaintenance() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected");
    console.log("Database:", mongoose.connection.name);

    const maintenance = await Maintenance.create({
      ticketId: "MS-0002-ACT",

      maintenanceType: "Customer Initiated",

      customerId: new mongoose.Types.ObjectId(
        "6a8eb2c9a307890da9c3fa8b"
      ),

      isUnderWarranty: true,

      date: new Date(),

      status: "New",

      materialList: [
        {
          item: 'Copper Piping 1/4" (per meter)',
          quantity: 5,
          estimatedCost: 5000
        }
      ],

      assignedTeamId: null,

      serviceReport: {
        technicianNotes: "",
        submittedAt: null,
        photos: []
      },

      paymentSlipUrl: "uploads/slips/test-slip.jpg",

      paymentAmount: 0
    });

    console.log("\nMaintenance inserted successfully!");
    console.log("--------------------------------");
    console.log("ID:", maintenance._id);
    console.log("Ticket ID:", maintenance.ticketId);
    console.log("Status:", maintenance.status);
    console.log("Created At:", maintenance.createdAt);
    console.log("Updated At:", maintenance.updatedAt);

  } catch (error) {
    console.error("\nError inserting maintenance:");
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log("\nMongoDB disconnected");
  }
}

insertMaintenance();