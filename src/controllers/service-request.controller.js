const ServiceRequest = require("../models/ServiceRequest");

// GET /api/service-requests
exports.getServiceRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ customer: req.user._id }).sort({ createdAt: -1 });
    return res.json(requests);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/service-requests/:id
exports.getServiceRequest = async (req, res) => {
  try {
    const sr = await ServiceRequest.findOne({ _id: req.params.id, customer: req.user._id });
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
      serviceTypeOther,
      problemDescription,
      problemImageUrl,
      preferredDate,
      preferredTimeSlot,
      estimatedCharges,
      paymentRequired
    } = req.body;

    if (!serviceType) {
      return res.status(400).json({ message: "Service type is required" });
    }

    const subject = serviceType === "Other" ? serviceTypeOther || "Other" : serviceType;

    const sr = await ServiceRequest.create({
      customer: req.user._id,
      acUnitModel: acUnitModel || "",
      acUnitSerial: acUnitSerial || "",
      acWarrantyStatus: acWarrantyStatus || "Unknown",
      acAmcStatus: acAmcStatus || "Not Active",
      serviceType,
      serviceTypeOther: serviceTypeOther || "",
      problemDescription: problemDescription || "",
      problemImageUrl: problemImageUrl || "",
      preferredDate: preferredDate || null,
      preferredTimeSlot: preferredTimeSlot || "",
      estimatedCharges: estimatedCharges || 0,
      paymentRequired: paymentRequired || false,
      subject,
      status: "Pending"
    });

    return res.status(201).json({ message: "Service request submitted successfully", serviceRequest: sr });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/service-requests/:id/cancel
exports.cancelServiceRequest = async (req, res) => {
  try {
    const sr = await ServiceRequest.findOne({ _id: req.params.id, customer: req.user._id });
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
