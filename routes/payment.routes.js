const express = require("express");
const router = express.Router();
const controller = require("../controllers/payment.controller");

router.post("/", controller.createPayment);
router.get("/pending", controller.getPendingPayments);
router.put("/approve/:id", controller.approvePayment);
router.put("/reject/:id", controller.rejectPayment);
router.put("/reupload/:id", controller.reuploadSlip);
/*router.get("/test", (req, res) => {
  console.log("🔥 TEST ROUTE HIT");
  res.json({ message: "Test route works" });
});*/
module.exports = router;