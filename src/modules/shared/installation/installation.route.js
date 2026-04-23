const express = require('express');
const router = express.Router();
const installationController = require('./installation.controller');

router.get('/', installationController.getAllInstallations);
router.get('/:id', installationController.getInstallationById);

module.exports = router;