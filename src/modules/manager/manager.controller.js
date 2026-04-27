const service = require("./manager.service");

exports.toString = (req, res) => {
  res.json({ message: "Manager module placeholder" });
};

/**
 * POST /api/manager/payments/auto-cancel
 * Manually trigger payment auto-cancel job
 */
exports.triggerPaymentAutoCancel = async (req, res) => {
  try {
    const result = await service.triggerPaymentAutoCancelJob();
    res.status(200).json({
      success: true,
      message: "Payment auto-cancel job triggered",
      data: result,
    });
  } catch (error) {
    console.error("Error triggering payment auto-cancel:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to trigger payment auto-cancel",
    });
  }
};

/**
 * POST /api/manager/orders/:orderId/approve
 * Approve a quotation
 */
exports.approveQuotation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const managerId = req.user._id;

    const order = await service.approveQuotation(orderId, managerId);

    res.status(200).json({
      success: true,
      message: "Quotation approved successfully",
      data: order,
    });
  } catch (error) {
    console.error("Error approving quotation:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to approve quotation",
    });
  }
};

/**
 * POST /api/manager/orders/:orderId/reject
 * Reject a quotation
 */
exports.rejectQuotation = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const managerId = req.user._id;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const order = await service.rejectQuotation(orderId, managerId, reason);

    res.status(200).json({
      success: true,
      message: "Quotation rejected successfully",
      data: order,
    });
  } catch (error) {
    console.error("Error rejecting quotation:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to reject quotation",
    });
  }
};

