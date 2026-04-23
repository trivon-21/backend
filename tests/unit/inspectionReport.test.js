const assert = require('assert');
const teamController = require('../controllers/techTeam.controller');
const availabilityUtils = require('../utils/availability.utils');

describe('Main Technician: Team Management', () => {
  describe('Availability Utils', () => {
    it('should exclude Sundays from available slots', () => {
      const teamJobs = [{ date: new Date('2026-04-19') }]; // A Sunday
      const slots = availabilityUtils.calculateAvailableSlots(teamJobs);
      
      const hasSunday = slots.some(s => s.getDay() === 0);
      assert.strictEqual(hasSunday, false); //
    });
  });

  describe('getTeamScheduleDetails', () => {
    it('should calculate specific occupied dates for a selected team', async () => {
      const mockReq = { params: { teamId: '65f...789' } };
      const result = await teamController.getTeamScheduleDetails(mockReq, mockRes);
      
      assert(result.data.availableSlots.length > 0); // Verify dynamic calculation
    });
  });
});