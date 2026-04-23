const assert = require('assert');
const reportController = require('../serviceReport.controller');

describe('Main Technician: Service Reports', () => {
  describe('getAllServiceReports', () => {
    it('should return a list of reports with nested customer names', async () => {
      const mockRes = { json: (data) => data };
      const result = await reportController.getAllServiceReports({ query: {} }, mockRes);
      
      assert.strictEqual(result.success, true);
      // Verify it pulls the flattened customer name from the JSON structure
      if (result.data.length > 0) {
        assert(result.data[0].customer.name); 
      }
    });

    it('should filter reports based on product type search', async () => {
      const mockReq = { query: { search: 'Daikin' } }; //
      const mockRes = { json: (data) => data };
      
      const result = await reportController.getAllServiceReports(mockReq, mockRes);
      
      const allMatch = result.data.every(r => 
        r.productDetails.detailedType.includes('Daikin')
      );
      assert.strictEqual(allMatch, true);
    });
  });

  describe('getServiceReportById', () => {
    it('should retrieve a specific report by its MongoDB _id', async () => {
      const mockReq = { params: { id: '69d8ceec70e220f6855a97c4' } }; //
      const mockRes = { json: (data) => data };

      const result = await reportController.getServiceReportById(mockReq, mockRes);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data._id.toString(), '69d8ceec70e220f6855a97c4');
    });

    it('should return 404 for a non-existent report ID', async () => {
      const mockReq = { params: { id: '000000000000000000000000' } };
      const mockRes = { 
        status: (code) => ({ json: (data) => ({ code, ...data }) }) 
      };

      const result = await reportController.getServiceReportById(mockReq, mockRes);
      assert.strictEqual(result.code, 404); //
    });
  });
});