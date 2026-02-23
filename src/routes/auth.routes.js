const router = require("express").Router();
const { body } = require("express-validator");
const { signup, login, forgotPassword, resetPassword } = require("../controllers/auth.controller");
const { validate } = require("../middleware/auth.middleware");

router.post(
  "/signup",
  [
    body("fullName").isLength({ min: 3 }).withMessage("Full name must be at least 3 characters"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter")
      .matches(/[0-9]/).withMessage("Password must contain at least one number")
      .matches(/[^A-Za-z0-9]/).withMessage("Password must contain at least one special character")
  ],
  validate,
  signup
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password is required")
  ],
  validate,
  login
);

router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Valid email required")],
  validate,
  forgotPassword
);

router.get("/forgot-password", (req, res) =>
  res.status(405).json({ message: "Method not allowed. Use POST to request a password reset." })
);

router.post(
  "/reset-password/:token",
  [
    body("password")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/).withMessage("Password must contain at least one lowercase letter")
      .matches(/[0-9]/).withMessage("Password must contain at least one number")
      .matches(/[^A-Za-z0-9]/).withMessage("Password must contain at least one special character")
  ],
  validate,
  resetPassword
);

router.get("/reset-password/:token", (req, res) =>
  res.status(405).json({ message: "Method not allowed. Use POST to submit your new password." })
);

module.exports = router;