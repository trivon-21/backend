// src/routes/serviceReport.route.js
const express = require('express');
const router = express.Router();
const controller = require('./technician.controller');

router.get('/', controller.getAllServiceReports);
router.post('/submit', controller.submitServiceReport);
router.get('/:id', controller.getServiceReportById);
router.patch('/:id', controller.updateServiceReport);

module.exports = router;