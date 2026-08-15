const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { validatePaymentSubmission } = require('../middleware/order.validation');

// Order Pathways
router.post('/buy-only', orderController.createBuyOnlyOrder);
router.post('/buy-and-install', orderController.createBuyAndInstallOrder);
router.post('/initialize', orderController.createBuyOnlyOrder); // Keep for safety
router.post('/submit-payment', 
  orderController.upload.single('slip'), 
  validatePaymentSubmission, 
  orderController.submitPayment
);

// General
router.get('/user/:userId', orderController.getOrdersByUser);
router.get('/id/:id', orderController.getOrderById);

module.exports = router;
