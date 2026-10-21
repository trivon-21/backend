require("dotenv").config();

const mongoose = require("mongoose");

const ServiceTicket = require("./modules/shared/serviceTicket/serviceTicket.model");

async function insertServiceTicket() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB");

    const serviceTicket = await ServiceTicket.create({

      // =====================================================
      // CUSTOMER
      // =====================================================

      customerId: new mongoose.Types.ObjectId(
        "6a8eb2c9a307890da9c3fa8b"
      ),

      // =====================================================
      // SERVICE REQUEST
      // =====================================================

      requestType: "Repair",

      description: "AC repair service required.",

      orderId: null,

      serviceType: "REPAIR",

      serviceFee: 0,

      // =====================================================
      // PAYMENT
      // =====================================================

      paymentStatus: "NEW",

      paymentSlipUrl: null,

      rejectionReason: null,

      slipUploadedAt: null,

      approvedAt: null,

      rejectedAt: null,

      // =====================================================
      // TICKET DETAILS
      // =====================================================

      subject: "AC Repair Request",

      category: "repair",

      priority: "medium",

      status: "New",

      // =====================================================
      // ASSIGNMENT / SLA
      // =====================================================

      assignedTechnicianId: null,

      slaDueAt: null,

      resolvedAt: null

      // createdAt and updatedAt are automatic
    });

    console.log("\n========================================");
    console.log("SERVICE TICKET INSERTED SUCCESSFULLY");
    console.log("========================================");

    console.log("Service Ticket ID :", serviceTicket._id);
    console.log("Customer ID       :", serviceTicket.customerId);
    console.log("Request Type      :", serviceTicket.requestType);
    console.log("Description       :", serviceTicket.description);
    console.log("Service Type      :", serviceTicket.serviceType);
    console.log("Payment Status     :", serviceTicket.paymentStatus);
    console.log("Category          :", serviceTicket.category);
    console.log("Priority          :", serviceTicket.priority);
    console.log("Status            :", serviceTicket.status);
    console.log("Created At        :", serviceTicket.createdAt);
    console.log("Updated At        :", serviceTicket.updatedAt);

    console.log("========================================\n");

    await mongoose.disconnect();

    console.log("Disconnected from MongoDB");

  } catch (error) {
    console.error("\nERROR INSERTING SERVICE TICKET:");
    console.error(error);

    await mongoose.disconnect();
  }
}

insertServiceTicket();