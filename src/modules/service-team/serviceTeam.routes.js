// src/routes/techTeam.route.js
const express = require('express');
const router = express.Router();
const techTeamController = require('./serviceTeam.controller');

// Existing routes
router.get('/', techTeamController.getAllTeamsWithMembers);
router.get('/pending-count', techTeamController.getPendingAssignments);
router.post('/assign-service', techTeamController.assignServiceRequestToTeam);

// NEW: Get schedule and slot availability for a specific team
router.get('/:teamId/schedule', techTeamController.getTeamScheduleDetails);

module.exports = router;