const express = require('express');
const router = express.Router();
const customerController = require('./user.controller');

// POST: /api/customers
router.post('/', customerController.createCustomer);

// GET: /api/customers
router.get('/', customerController.getAllCustomers);

// GET: /api/customers/:id
router.get('/:id', customerController.getCustomerById);

module.exports = router;
