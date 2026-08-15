const express = require("express");
const router = express.Router();
const controller = require("./purchaseRequest.controller");

router.get("/pending", controller.getPendingRequests);
router.get("/approved", controller.getApprovedRequests);
router.get("/rejected", controller.getRejectedRequests);
router.put("/approve/:id", controller.approveRequest);
router.put("/reject/:id", controller.rejectRequest);

module.exports = router;