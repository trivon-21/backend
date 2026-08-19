const express = require("express");
const router = express.Router();
const controller = require("./auditLog.controller");

router.get("/", controller.getLogs);
router.get("/stats", controller.getStats);
router.get("/:id", controller.getLog);

module.exports = router;