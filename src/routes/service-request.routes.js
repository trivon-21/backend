const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/protect");
const ctrl = require("../controllers/service-request.controller");

router.use(protect);
router.get("/", ctrl.getServiceRequests);
router.get("/:id", ctrl.getServiceRequest);
router.post("/", ctrl.createServiceRequest);
router.post("/:id/cancel", ctrl.cancelServiceRequest);

module.exports = router;
