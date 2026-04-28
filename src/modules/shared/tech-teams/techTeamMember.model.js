// src/models/TeamMember.js
const mongoose = require('mongoose');

const techTeamMemberSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, enum: ['Team Leader', 'Technician', 'Helper'], required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'TechTeam', required: true }
});

module.exports = mongoose.model('TechTeamMember', techTeamMemberSchema, 'TechTeamMembers');