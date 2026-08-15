const { body, validationResult } = require('express-validator');

exports.validatePaymentSubmission = [
  body('orderReference')
    .notEmpty().withMessage('Order Reference is required'),

  body('firstName')
    .notEmpty().withMessage('First Name is required')
    .isAlpha('en-US', { ignore: ' ' }).withMessage('First Name must contain only alphabetic characters'),

  body('lastName')
    .notEmpty().withMessage('Last Name is required')
    .isAlpha('en-US', { ignore: ' ' }).withMessage('Last Name must contain only alphabetic characters'),

  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address'),

  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .matches(/^0\d{9}$/).withMessage('Phone number must be 10 digits and start with 0'),

  body('address')
    .notEmpty().withMessage('Address is required'),

  body('city')
    .notEmpty().withMessage('City is required'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({ field: err.path, message: err.msg }))
      });
    }
    next();
  }
];
