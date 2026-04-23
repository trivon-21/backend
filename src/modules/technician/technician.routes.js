// src/routes/serviceReport.route.js
const express = require('express');
const router = express.Router();
const controller = require('./technician.controller');

router.get('/', controller.getAllServiceReports);
router.get('/:id', controller.getServiceReportById);

module.exports = router;