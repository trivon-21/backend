const express = require("express");
const router = express.Router();
const controller = require("./financialReport.controller");

router.get("/summary", controller.getRevenueSummary);
router.get("/transactions", controller.getTransactions);
router.get("/outstanding", controller.getOutstanding);
router.get("/collections", controller.getPaymentCollections);

module.exports = router;