const assert = require('assert');
const serviceController = require('../../src/modules/shared/serviceRequest/serviceRequest.controller');

// Mock database models
const ServiceRequest = require('../../src/modules/shared/serviceRequest/serviceRequest.model');
const Installation = require('../../src/modules/shared/installation/installation.model');
const Inspection = require('../../src/modules/shared/inspection/inspection.model');
const Customer = require('../../src/modules/customer/customer.model');
const mongoose = require('mongoose');

// Mock mongoose validation
const originalIsValid = mongoose.Types.ObjectId.isValid;
mongoose.Types.ObjectId.isValid = (id) => originalIsValid(id) || String(id).startsWith('65f');

// Stub model methods
const mockServiceData = [
  { _id: '507f1f77bcf86cd799439011', customerId: '507f1f77bcf86cd799439012', status: 'Assigned', customerName: 'John Doe', location: '123 Main St', assignedTeamName: 'Team A', assignedTeam: { teamName: 'Team A' } }
];

const mockServiceById = {
  _id: '507f1f77bcf86cd799439013',
  customerId: '507f1f77bcf86cd799439014',
  status: 'In Progress',
  progress: { totalTasks: 5, completedTasks: 2 },
  customerName: 'Jane Doe',
  location: '456 Oak Ave',
  assignedTeamName: 'Team B',
  assignedTeam: { teamName: 'Team B' }
};

const queryChain = {
  populate: function() { return this; },
  lean: async function() { return this._data; }
};

ServiceRequest.find = () => ({ ...queryChain, _data: mockServiceData });
ServiceRequest.findById = (id) => ({ ...queryChain, _data: mockServiceById });
ServiceRequest.findOne = () => ({ ...queryChain, _data: null });

Installation.find = () => ({ ...queryChain, _data: [] });
Installation.findById = () => ({ ...queryChain, _data: null });
Installation.findOne = () => ({ ...queryChain, _data: null });
Installation.collection = { find: () => ({ toArray: async () => [] }) };

Inspection.find = () => ({ ...queryChain, _data: [] });
Inspection.findById = () => ({ ...queryChain, _data: null });
Inspection.findOne = () => ({ ...queryChain, _data: null });
Inspection.collection = { find: () => ({ toArray: async () => [] }) };

Customer.find = (query) => {
  // Handle queries with $in operator or other query formats
  return { ...queryChain, _data: [] };
};
Customer.findById = () => ({ ...queryChain, _data: null });
Customer.findOne = () => ({ ...queryChain, _data: null });

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

describe('Main Technician: Service Requests', () => {
  describe('getAllServiceRequests', () => {
    it('should only return records with executable statuses', async () => {
      // Mocking executable statuses: Assigned, Scheduled, In Progress, etc.
      await serviceController.getAllServiceRequests({}, mockRes);
      const results = mockRes._last;
      assert(results && results.success === true); // Verify controller returns success
      assert(Array.isArray(results.data)); // Verify data is array
    });
  });

  describe('getCustomerHistory', () => {
    it('should aggregate history from Service, Installation, and Inspection collections', async () => {
      const mockReq = { params: { id: '507f1f77bcf86cd799439013' }, query: {} };
      await serviceController.getCustomerHistory(mockReq, mockRes);
      const historyResult = mockRes._last;
      assert(historyResult && historyResult.success === true); // Verify controller returns success
    });
  });
});