const express = require('express');
const router = express.Router();
const teamController = require('./team.controller');

router.get('/details', teamController.getTeamDetails);

module.exports = router;