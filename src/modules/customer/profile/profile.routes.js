const router = require("express").Router();
const { body } = require("express-validator");
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
} = require("./profile.controller");
const { validate } = require("../../../middleware/auth.middleware");

// GET profile
router.get("/", getProfile);

// PUT profile (update basic info)
router.put(
  "/",
  [
    body("fullName").optional().isLength({ min: 3 }).withMessage("Full name must be at least 3 characters"),
    body("gender").optional().isIn(["Male", "Female", "Other"]).withMessage("Invalid gender")
  ],
  validate,
  updateProfile
);

// POST add email
router.post(
  "/emails",
  [body("email").isEmail().withMessage("Valid email required")],
  validate,
  addEmail
);

// DELETE remove email
router.delete("/emails/:emailId", removeEmail);

// POST verify additional email
router.post("/emails/:emailId/verify", verifyAdditionalEmail);

// POST resend email OTP
router.post("/emails/:emailId/resend-otp", resendAdditionalEmailOtp);

// DELETE account
router.delete("/account", deleteAccount);

// POST change password
router.post(
  "/change-password",
  [
    body("currentPassword").notEmpty().withMessage("Current password required"),
    body("newPassword")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/).withMessage("Password must contain uppercase")
      .matches(/[a-z]/).withMessage("Password must contain lowercase")
      .matches(/[0-9]/).withMessage("Password must contain number")
      .matches(/[^A-Za-z0-9]/).withMessage("Password must contain special character")
  ],
  validate,
  changePassword
);

// PUT upload profile photo
router.put("/photo", uploadPhoto);

module.exports = router;
