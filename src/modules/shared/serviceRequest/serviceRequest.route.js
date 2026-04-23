const express = require('express');
const router = express.Router();
const controller = require('./serviceRequest.controller');

router.get('/', controller.getAllServiceRequests);
router.get('/:id', controller.getServiceRequestById);
router.get('/:id/history', controller.getCustomerHistory);

module.exports = router;