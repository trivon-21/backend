const router = require("express").Router();
const { protect } = require("../middleware/protect");
const { getDashboard } = require("../controllers/dashboard.controller");

router.use(protect);

router.get("/", getDashboard);

module.exports = router;
