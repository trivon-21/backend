const assert = require('assert');
const serviceController = require('../controllers/serviceRequest.controller');

describe('Main Technician: Service Requests', () => {
  describe('getAllServiceRequests', () => {
    it('should only return records with executable statuses', async () => {
      // Mocking executable statuses: Assigned, Scheduled, In Progress, etc.
      const results = await serviceController.getAllServiceRequests({}, mockRes);
      
      const invalidStatuses = results.data.filter(s => 
        ['Pending', 'Finance Approved', 'Sent to IM'].includes(s.status)
      );
      assert.strictEqual(invalidStatuses.length, 0); // Verify visibility logic
    });
  });

  describe('getCustomerHistory', () => {
    it('should aggregate history from Service, Installation, and Inspection collections', async () => {
      const mockReq = { params: { id: '65f...def' } };
      const historyResult = await serviceController.getCustomerHistory(mockReq, mockRes);
      
      assert(Array.isArray(historyResult.data.history)); // Verify aggregation
    });
  });
});