const express = require('express');
const router = express.Router();
const controller = require('./repair.controller');
const serviceHistoryController = require('../service-history/serviceHistory.controller');

router.get('/', controller.getAllServiceRequests);
router.get('/:id/history', serviceHistoryController.getCustomerHistory);
router.get('/:id', controller.getServiceRequestById);

module.exports = router;
