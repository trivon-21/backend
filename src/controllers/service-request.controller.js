const ServiceRequest = require("../models/ServiceRequest");
const configCache = require("../utils/config-cache");
const Charge = require("../modules/shared/L_charges.model");
const Maintenance = require("../modules/shared/maintenance/maintenance.model");
const { createLog } = require("../modules/finance/auditLog.controller");
const { validatePaymentSlip } = require("../services/slipValidation.service");

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

// POST /api/service-requests/validate-slip
exports.validateSlip = async (req, res) => {
  try {
    const { paymentSlipUrl, slip } = req.body;
    const slipData = paymentSlipUrl || slip;

    if (!slipData) {
      return res.status(400).json({ success: false, message: 'No payment slip provided' });
    }

    let fileBuffer = null;
    let declaredMime = null;

    if (typeof slipData === 'string' && slipData.startsWith('data:')) {
      const matches = slipData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        declaredMime = matches[1];
        fileBuffer = Buffer.from(matches[2], 'base64');
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({ success: false, message: 'Invalid payment slip format' });
    }

    const validation = await validatePaymentSlip(fileBuffer, declaredMime);
    if (!validation.isValid) {
      return res.status(422).json({
        success: false,
        layer: validation.layer,
        message: validation.error
      });
    }

    return res.json({
      success: true,
      message: 'Payment slip validated successfully',
      matchedCount: validation.matchedCount,
      matchedKeywords: validation.matchedKeywords
    });
  } catch (err) {
    console.error('[ServiceRequest] validateSlip error:', err);
    return res.status(500).json({ success: false, message: err.message });
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
      paymentSlipUrl,
      requestType,
      maintenanceType
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

    // Verify slip with Layer 1 (magic bytes) and Layer 2 (OCR content)
    if (paymentSlipUrl && typeof paymentSlipUrl === 'string' && paymentSlipUrl.startsWith('data:')) {
      const matches = paymentSlipUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const declaredMime = matches[1];
        const fileBuffer = Buffer.from(matches[2], 'base64');
        const validation = await validatePaymentSlip(fileBuffer, declaredMime);
        if (!validation.isValid) {
          return res.status(422).json({
            success: false,
            layer: validation.layer,
            message: validation.error
          });
        }
      }
    }

    const isStaffOrCsa = req.user && (req.user.role === 'CSA' || req.user.role === 'STAFF' || req.user.role === 'ADMIN');
    const effectiveCustomerId = (isStaffOrCsa && req.body.customerId) ? req.body.customerId : req.user._id;
    const effectiveMaintenanceType = maintenanceType || (isStaffOrCsa ? "Company Initiated" : "Customer Initiated");
    const effectiveRequestType = requestType || effectiveMaintenanceType;

    const sr = await ServiceRequest.create({
      customerId: effectiveCustomerId,
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
      requestType: effectiveRequestType,
      maintenanceType: effectiveMaintenanceType,
      subject: serviceType,
      status: "New"
    });

    // If Maintenance, also record in maintenances collection so Finance Officer can review and verify
    if (serviceType === "Maintenance") {
      try {
        await Maintenance.create({
          ticketId: sr.serviceRequestRef,
          maintenanceType: effectiveMaintenanceType,
          customerId: effectiveCustomerId,
          isUnderWarranty: acWarrantyStatus === "Active",
          date: preferredDate ? new Date(preferredDate) : new Date(),
          status: "Pending",
          paymentSlipUrl: paymentSlipUrl || null,
          paymentAmount,
          acUnitModel: acUnitModel || "",
          productType: acUnitModel || "",
          description: problemDescription || `Maintenance for ${acUnitModel || 'AC Unit'}`
        });

        if (paymentSlipUrl) {
          await createLog({
            eventType: "SERVICE_PAYMENT_SUBMITTED",
            paymentType: "MAINTENANCE",
            ticketId: sr.serviceRequestRef,
            customerId: effectiveCustomerId,
            amount: paymentAmount,
            slipUrl: paymentSlipUrl,
            performedBy: isStaffOrCsa ? "CSA" : "Customer"
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
