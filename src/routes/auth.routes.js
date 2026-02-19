const router = require("express").Router();
const { body } = require("express-validator");
const { signup, login } = require("../controllers/auth.controller");
const { validate } = require("../middleware/auth.middleware");

router.post(
  "/signup",
  [
    body("fullName").isLength({ min: 3 }).withMessage("Full name must be at least 3 characters"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
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

module.exports = router;