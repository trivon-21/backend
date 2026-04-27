const router = require("express").Router();
const controller = require("./manager.controller");
const { protect } = require("../../middleware/protect");
const { authorize } = require("../../middleware/role.middleware");

// All manager routes require authentication and MANAGER role
router.use(protect);
router.use(authorize(["MANAGER", "SUPER_ADMIN"]));

// Status endpoint
router.get("/", controller.toString);

// Payment auto-cancel endpoint
router.post("/payments/auto-cancel", controller.triggerPaymentAutoCancel);

// Quotation approval/rejection endpoints
router.post("/orders/:orderId/approve", controller.approveQuotation);
router.post("/orders/:orderId/reject", controller.rejectQuotation);

module.exports = router;

