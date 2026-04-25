const express = require('express');
const router = express.Router();
const serviceHistoryController = require('./serviceHistory.controller');

// Endpoint used by both Service Team and Main Technician views
router.get('/:id', serviceHistoryController.getCustomerHistory);

module.exports = router;