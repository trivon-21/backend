const express = require('express');
const router = express.Router();
const inspectionController = require('./inspectionTicket.controller');

router.get('/', inspectionController.getAllInspections);
router.get('/:id', inspectionController.getInspectionById);
router.patch('/:id/status', inspectionController.updateInspectionStatus);

module.exports = router;

