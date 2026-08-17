const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');

// GET /api/config/bank — fetch bank payment details
router.get('/bank', configController.getBankDetails);

// GET /api/config/system-info — fetch public system information
router.get('/system-info', configController.getSystemInfo);

module.exports = router;
