const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/protect");
const ctrl = require("../controllers/inquiry.controller");

router.use(protect);
router.get("/", ctrl.getInquiries);
router.get("/:id", ctrl.getInquiry);
router.post("/", ctrl.createInquiry);
router.post("/:id/reply", ctrl.replyToInquiry);

module.exports = router;
