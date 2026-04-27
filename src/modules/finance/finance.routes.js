const router = require("express").Router();
const controller = require("./finance.controller");
const { protect } = require("../../middleware/protect");

// Add routes here
router.get("/", protect, controller.toString);

module.exports = router;
