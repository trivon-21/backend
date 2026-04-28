const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');

// Get cart for a user
router.get('/:userId', cartController.getCart);

// Add or update item in cart
router.post('/item', cartController.addOrUpdateItem);

// Remove item from cart
router.delete('/item', cartController.removeItem);

// Clear cart
router.post('/clear', cartController.clearCart);

// Update additional charges
router.post('/charges', cartController.updateAdditionalCharges);

module.exports = router;
