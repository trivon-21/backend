const router = require("express").Router();
const { body } = require("express-validator");
const { login } = require("./auth.controller");
const { validate } = require("../../middleware/auth.middleware");

router.post(
  "/login",
  [
    body("password").notEmpty().withMessage("Password is required"),
    body().custom((value, { req }) => {
      const { identifier, email, phoneNumber } = req.body;
      if (!identifier && !email && !phoneNumber) {
        throw new Error("identifier (email or phone) is required");
      }
      return true;
    })
  ],
  validate,
  login
);

module.exports = router;
