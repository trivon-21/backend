const ServiceRequest = require("../models/ServiceRequest");
const configCache = require("../utils/config-cache");
const Charge = require("../modules/shared/L_charges.model");
const Maintenance = require("../modules/shared/maintenance/maintenance.model");
const { createLog } = require("../modules/finance/auditLog.controller");

// GET /api/service-requests/charges
exports.getCharges = async (req, res) => {
  try {
    const charges = await Charge.find({}).lean();
    const maintenanceCharge = charges.find(c => /maintenance/i.test(c.name));
    const repairCharge = charges.find(c => /repair/i.test(c.name));

    return res.json({
      success: true,
      charges,
      maintenanceFee: maintenanceCharge ? maintenanceCharge.amount : 6000,
      repairFee: repairCharge ? repairCharge.amount : 7500,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/service-requests
exports.getServiceRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ customerId: req.user._id }).sort({ createdAt: -1 });
    return res.json(requests);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/service-requests/:id
exports.getServiceRequest = async (req, res) => {
  try {
    const sr = await ServiceRequest.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!sr) return res.status(404).json({ message: "Service request not found" });
    return res.json(sr);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/service-requests
exports.createServiceRequest = async (req, res) => {
  try {
    const {
      acUnitModel,
      acUnitSerial,
      acWarrantyStatus,
      acAmcStatus,
      serviceType,
      problemDescription,
      problemImageUrl,
      preferredDate,
      preferredTimeSlot,
      paymentSlipUrl
    } = req.body;

    if (!serviceType || !["Repair", "Maintenance"].includes(serviceType)) {
      return res.status(400).json({ message: "Service type must be either Repair or Maintenance" });
    }

    // Check feature flags for warranty
    const flags = await configCache.getFeatureFlags();
    if (acWarrantyStatus === "Active" && !flags.warrantyModuleEnabled) {
      return res.status(403).json({
        success: false,
        message: "Warranty services are currently disabled",
      });
    }

    // Query fee from charges collection in database
    let estimatedCharges = 0;
    let paymentRequired = false;
    let paymentAmount = 0;
    let paymentStatus = "NOT_REQUIRED";

    if (serviceType === "Maintenance") {
      const maintenanceCharge = await Charge.findOne({ name: { $regex: /maintenance/i } }).lean();
      const fee = maintenanceCharge ? maintenanceCharge.amount : 6000;
      estimatedCharges = fee;
      paymentAmount = fee;
      paymentRequired = true;
      paymentStatus = paymentSlipUrl ? "UNDER_REVIEW" : "PENDING";
    }

    const sr = await ServiceRequest.create({
      customerId: req.user._id,
      acUnitModel: acUnitModel || "",
      acUnitSerial: acUnitSerial || "",
      acWarrantyStatus: acWarrantyStatus || "Unknown",
      acAmcStatus: acAmcStatus || "Not Active",
      serviceType,
      serviceTypeOther: "",
      problemDescription: problemDescription || "",
      problemImageUrl: problemImageUrl || "",
      preferredDate: preferredDate || null,
      preferredTimeSlot: preferredTimeSlot || "",
      estimatedCharges,
      paymentRequired,
      paymentAmount,
      paymentSlipUrl: paymentSlipUrl || "",
      paymentStatus,
      subject: serviceType,
      status: "Pending"
    });

    // If Maintenance, also record in maintenances collection so Finance Officer can review and verify
    if (serviceType === "Maintenance") {
      try {
        await Maintenance.create({
          ticketId: sr.serviceRequestRef,
          maintenanceType: "Customer Initiated",
          customerId: req.user._id,
          isUnderWarranty: acWarrantyStatus === "Active",
          date: preferredDate ? new Date(preferredDate) : new Date(),
          status: "Pending",
          paymentSlipUrl: paymentSlipUrl || null,
          paymentAmount
        });

        if (paymentSlipUrl) {
          await createLog({
            eventType: "SERVICE_PAYMENT_SUBMITTED",
            paymentType: "MAINTENANCE",
            ticketId: sr.serviceRequestRef,
            customerId: req.user._id,
            amount: paymentAmount,
            slipUrl: paymentSlipUrl,
            performedBy: "Customer"
          }).catch(logErr => console.warn("Audit log error:", logErr.message));
        }
      } catch (maintErr) {
        console.error("Failed to create maintenance document:", maintErr);
      }
    }

    return res.status(201).json({ message: "Service request submitted successfully", serviceRequest: sr });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/service-requests/:id/cancel
exports.cancelServiceRequest = async (req, res) => {
  try {
    const sr = await ServiceRequest.findOne({ _id: req.params.id, customerId: req.user._id });
    if (!sr) return res.status(404).json({ message: "Service request not found" });

    if (["Completed", "Cancelled"].includes(sr.status)) {
      return res.status(400).json({ message: "Cannot cancel a completed or already cancelled request" });
    }

    sr.status = "Cancelled";
    await sr.save();
    return res.json({ message: "Service request cancelled" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
