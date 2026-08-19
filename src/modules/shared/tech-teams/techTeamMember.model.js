// src/models/TeamMember.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const techTeamMemberSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'TechTeam', required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['Lead', 'Assistant', 'Driver'] },
    contactNumber: String,
  },
  { timestamps: true, collection: 'tech_team_members' }
);

module.exports = mongoose.model('TechTeamMember', techTeamMemberSchema);
