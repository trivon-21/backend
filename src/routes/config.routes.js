const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');

// GET /api/config/bank — fetch bank payment details
router.get('/bank', configController.getBankDetails);

module.exports = router;
