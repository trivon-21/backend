const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/protect");
const ctrl = require("../controllers/feedback.controller");

router.use(protect);
router.get("/", ctrl.getFeedbacks);
router.post("/", ctrl.createFeedback);

module.exports = router;
