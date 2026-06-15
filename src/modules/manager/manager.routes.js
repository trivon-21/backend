const router = require("express").Router();
const controller = require("./manager.controller");
const { protect } = require("../../middleware/protect");

// Manager dashboard data endpoint
router.get("/dashboard", protect, controller.getDashboard);

module.exports = router;
