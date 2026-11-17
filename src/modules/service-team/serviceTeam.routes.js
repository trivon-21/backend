// src/routes/techTeam.route.js
const express = require('express');
const router = express.Router();
// Debug middleware (uses logger; only prints when VERBOSE_LOGS=true)
const logger = require('../../utils/logger');
router.use((req, res, next) => {
	logger.debug('/api/tech-teams request', { method: req.method, path: req.path, bodyKeys: Object.keys(req.body || {}) });
	next();
});
const techTeamController = require('./serviceTeam.controller');
const { protect } = require('../../middleware/protect');
const { authorize } = require('../../middleware/role.middleware');

router.use(protect);
router.use(authorize(['MAIN_TECH', 'SUPER_ADMIN']));

// Existing routes
router.get('/', techTeamController.getAllTeamsWithMembers);
router.get('/pending-count', techTeamController.getPendingAssignments);
router.post('/assign-service', techTeamController.assignServiceRequestToTeam);

// NEW: Get schedule and slot availability for a specific team
router.get('/:teamId/schedule', techTeamController.getTeamScheduleDetails);

module.exports = router;
