const express = require("express");
const router = express.Router();
const controller = require("./purchaseRequest.controller");
const { protect } = require("../../middleware/protect");
const { authorize } = require("../../middleware/role.middleware");

router.use(protect);
router.use(authorize(["FINANCE", "SUPER_ADMIN"]));

router.get("/pending", controller.getPendingRequests);
router.get("/approved", controller.getApprovedRequests);
router.get("/rejected", controller.getRejectedRequests);
router.put("/approve/:id", controller.approveRequest);
router.put("/reject/:id", controller.rejectRequest);

module.exports = router;
