const assert = require('assert');
const teamController = require('../../src/modules/service-team/serviceTeam.controller');
const availabilityUtils = require('../../src/utils/availability.utils');

// Mock database models
const TechTeam = require('../../src/modules/service-team/serviceTeam.model');
const TechTeamMember = require('../../src/modules/service-team/serviceTeamMember.model');
const ServiceRequest = require('../../src/modules/shared/serviceRequest/serviceRequest.model');
const Installation = require('../../src/modules/shared/installation/installation.model');
const Inspection = require('../../src/modules/shared/inspection/inspection.model');
const Maintenance = require('../../src/modules/shared/maintenance/maintenance.model');
const Customer = require('../../src/modules/customer/customer.model');
const mongoose = require('mongoose');

// Mock mongoose validation
const originalIsValid = mongoose.Types.ObjectId.isValid;
mongoose.Types.ObjectId.isValid = (id) => originalIsValid(id) || String(id).startsWith('65f');

// Stub model methods
const mockTeam = { _id: '65f789', teamName: 'Test Team', teamType: 'Service Team' };
const queryChain = {
  populate: function() { return this; },
  lean: async function() { return this._data; }
};

TechTeam.findById = (id) => ({ ...queryChain, _data: mockTeam });
TechTeam.find = () => ({ ...queryChain, _data: [mockTeam] });
TechTeamMember.collection = { find: () => ({ toArray: async () => [] }) };
ServiceRequest.collection = { find: () => ({ toArray: async () => [] }) };
Installation.collection = { find: () => ({ toArray: async () => [] }) };
Inspection.collection = { find: () => ({ toArray: async () => [] }) };
Maintenance.collection = { find: () => ({ toArray: async () => [] }) };
Customer.find = () => ({ ...queryChain, _data: [] });

const mockRes = { 
  json(data){ 
    this._statusCode = this._status || 200;
    this._last = data; 
    return data; 
  }, 
  status(code){ 
    this._status = code; 
    return this; 
  } 
};

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
      await teamController.getTeamScheduleDetails(mockReq, mockRes);
      const result = mockRes._last;
      assert(result && result.success === true); // Verify controller returns success
      assert(Array.isArray(result.data.availableSlots)); // Verify availableSlots is array
    });
  });
});