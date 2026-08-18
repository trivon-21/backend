const express = require('express');
const router = express.Router();
const controller = require('./repair.controller');

router.get('/', controller.getAllServiceRequests);
router.get('/:id/history', controller.getCustomerHistory);
router.get('/:id', controller.getServiceRequestById);

module.exports = router;
