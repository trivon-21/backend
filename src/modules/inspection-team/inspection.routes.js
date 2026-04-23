// src/routes/inspectionReport.route.js
const express = require('express');
const router = express.Router();
const controller = require('./inspection.controller');

router.get('/', controller.getAllReports);
router.get('/:id', controller.getReportById);
router.patch('/:id/requirements', controller.updateRequirements);
router.patch('/:id/approve', controller.approveReport);
router.patch('/:id/reject', controller.rejectReport);

module.exports = router;