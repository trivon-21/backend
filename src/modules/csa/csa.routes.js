const router = require("express").Router();
const controller = require("./csa.controller");
const { protect } = require("../../middleware/protect");

// Add routes here
router.get("/", protect, controller.toString);

module.exports = router;
