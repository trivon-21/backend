const router = require("express").Router();
const { protect } = require("../middleware/protect");
const {
  getProfile,
  updateProfile,
  addEmail,
  removeEmail,
  verifyAdditionalEmail,
  resendAdditionalEmailOtp,
  deleteAccount,
  changePassword,
  uploadPhoto
} = require("../controllers/profile.controller");

router.use(protect);

router.get("/", getProfile);
router.put("/", updateProfile);
router.post("/emails", addEmail);
router.delete("/emails/:emailId", removeEmail);
router.post("/emails/:emailId/verify", verifyAdditionalEmail);
router.post("/emails/:emailId/resend-otp", resendAdditionalEmailOtp);
router.delete("/account", deleteAccount);
router.post("/change-password", changePassword);
router.put("/photo", uploadPhoto);

module.exports = router;
