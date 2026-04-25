// src/models/Team.js
const mongoose = require('mongoose');

const techTeamSchema = new mongoose.Schema({
  teamName: { type: String, required: true }, // e.g., "Service Team A"
  teamType: { type: String, enum: ['Service Team', 'Inspection Team'], required: true },
  status: { type: String, enum: ['Available', 'Busy'], default: 'Available' },
  activeJobsCount: { type: Number, default: 0 },
  availableSlots: [Date], // Dates shown in the "Available Dates" section
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.TechTeam || mongoose.model('TechTeam', techTeamSchema, 'TechTeams');