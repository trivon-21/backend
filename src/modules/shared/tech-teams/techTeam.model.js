const mongoose = require('mongoose');
const { Schema } = mongoose;

const techTeamSchema = new Schema(
  {
    teamName: { type: String, required: true },
    specialization: String,
    status: { type: String, enum: ['Available', 'On Job', 'Inactive'], default: 'Available' },
    activeJobsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'tech_teams' }
);

module.exports = mongoose.model('TechTeam', techTeamSchema);
