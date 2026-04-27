const router = require("express").Router();
const { getDashboard } = require("./dashboard.controller");

router.get("/", getDashboard);

module.exports = router;
