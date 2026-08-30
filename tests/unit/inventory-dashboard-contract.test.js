const assert = require('node:assert/strict');
const controller = require('../../src/modules/inventory-manager/inventory_manager.controller');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');

describe('Inventory Manager dashboard contract', () => {
  it('preserves the complete successful DTO shape in the fallback response', async () => {
    const originalGetDashboardData = service.getDashboardData;
    const originalConsoleError = console.error;
    let response;
    service.getDashboardData = async () => { throw new Error('fabricated database outage'); };
    console.error = () => {};

    try {
      await controller.getDashboard(
        { user: { fullName: 'Test Manager' } },
        { json: (body) => { response = body; } },
      );
    } finally {
      service.getDashboardData = originalGetDashboardData;
      console.error = originalConsoleError;
    }

    assert.equal(response.status, 'Offline');
    assert.deepEqual(response.procurementWorkflow, {
      awaitingManager: 0,
      awaitingReceipt: 0,
      awaitingFinance: 0,
    });
    assert.deepEqual(response.recentActivity, []);
    assert.deepEqual(response.reorderList, []);
    assert.deepEqual(Object.keys(response.stats).sort(), [
      'assetHealth', 'dispatchQueue', 'materialReservations', 'stockAlerts',
    ]);
  });
});
