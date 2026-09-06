const assert = require('node:assert/strict');
const controller = require('../../src/modules/inventory-manager/inventory_manager.controller');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');

describe('Inventory Manager dashboard contract', () => {
  it('returns the fixed warehouse catalog without exposing mutable shared arrays', () => {
    const first = service.getInventoryLocations();
    first[0].placementAreas.push('Invented Area');
    const second = service.getInventoryLocations();

    assert.equal(second.length, 3);
    assert.equal(second[0].warehouse, 'Central Warehouse');
    assert.equal(second[0].placementAreas.includes('Invented Area'), false);
  });

  it('returns HTTP 503 INVENTORY_DASHBOARD_UNAVAILABLE on service failure', async () => {
    const originalGetDashboardData = service.getDashboardData;
    const originalConsoleError = console.error;
    let statusCode;
    let responseBody;
    service.getDashboardData = async () => { throw new Error('fabricated database outage'); };
    console.error = () => {};

    try {
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          responseBody = body;
          return this;
        },
      };
      await controller.getDashboard(
        { user: { fullName: 'Test Manager' } },
        res,
      );
    } finally {
      service.getDashboardData = originalGetDashboardData;
      console.error = originalConsoleError;
    }

    assert.equal(statusCode, 503);
    assert.deepEqual(responseBody, {
      code: 'INVENTORY_DASHBOARD_UNAVAILABLE',
      message: 'Inventory dashboard is currently unavailable',
    });
  });

  it('preserves the complete successful DTO shape on valid response', async () => {
    const originalGetDashboardData = service.getDashboardData;
    let responseBody;
    const fakeData = {
      managerName: 'Test',
      currentDate: new Date('2026-08-24T09:30:00.000Z'),
      status: 'Operational',
      stats: {
        materialReservations: { total: 0, subStats: [] },
        dispatchQueue: { total: 0, subStats: [] },
        assetHealth: { total: 0, subStats: [] },
        stockAlerts: { total: 0, subStats: [] },
      },
      recentActivity: [],
      reorderList: [],
      procurementWorkflow: {
        awaitingManager: 0,
        awaitingFinanceApproval: 0,
        readyToIssue: 0,
        readyToReceive: 0,
        awaitingReceiptReconciliation: 0,
        breakdown: {
          awaitingManager: { purchaseRequests: 0, receiptAuthorizations: 0 },
          readyToReceive: { purchaseOrders: 0, receiptAuthorizations: 0 },
        },
        awaitingReceipt: 0,
        awaitingFinance: 0,
      },
      logistics: [],
    };
    service.getDashboardData = async () => fakeData;

    try {
      const res = {
        json(body) {
          responseBody = body;
          return this;
        },
      };
      await controller.getDashboard(
        { user: { fullName: 'Test Manager' } },
        res,
      );
    } finally {
      service.getDashboardData = originalGetDashboardData;
    }

    assert.equal(responseBody.status, 'Operational');
    assert.deepEqual(responseBody.procurementWorkflow, fakeData.procurementWorkflow);
    assert.deepEqual(responseBody.recentActivity, []);
    assert.deepEqual(responseBody.reorderList, []);
    assert.deepEqual(responseBody.logistics, []);
    assert.deepEqual(Object.keys(responseBody.stats).sort(), [
      'assetHealth', 'dispatchQueue', 'materialReservations', 'stockAlerts',
    ]);
  });

  it('maintains identical DTO keys across valid empty and populated responses', async () => {
    const originalGetDashboardData = service.getDashboardData;
    let emptyResult;
    let populatedResult;

    const emptyDto = {
      managerName: 'Manager',
      currentDate: new Date(),
      status: 'Operational',
      stats: {
        materialReservations: { total: 0, subStats: [] },
        dispatchQueue: { total: 0, subStats: [] },
        assetHealth: { total: 0, subStats: [] },
        stockAlerts: { total: 0, subStats: [] },
      },
      recentActivity: [],
      reorderList: [],
      procurementWorkflow: {
        awaitingManager: 0, awaitingFinanceApproval: 0, readyToIssue: 0,
        readyToReceive: 0, awaitingReceiptReconciliation: 0,
        breakdown: { awaitingManager: { purchaseRequests: 0, receiptAuthorizations: 0 }, readyToReceive: { purchaseOrders: 0, receiptAuthorizations: 0 } },
        awaitingReceipt: 0, awaitingFinance: 0,
      },
      logistics: [],
    };

    const populatedDto = {
      ...emptyDto,
      recentActivity: [{ id: 'act-1', type: 'dispatch', title: 'Dispatched', description: 'Item sent', timestamp: new Date() }],
      reorderList: [{ id: 'item-1', name: 'Filter', available: 1, reserved: 2, status: 'warning', stockStatus: 'low-stock' }],
      logistics: [
        { id: 'ORD-1', orderId: 'ORD-1', customer: 'Acme', status: 'to-pack', statusVersion: 0, type: 'standard', courier: '', trackId: '', itemCount: 2 },
        { id: 'ORD-2', orderId: 'ORD-2', customer: 'Global', status: 'ready', statusVersion: 1, type: 'express', courier: 'DHL', trackId: 'TRK1', itemCount: 1 },
      ],
    };

    try {
      const mockRes = (setter) => ({ json: (body) => setter(body) });
      service.getDashboardData = async () => emptyDto;
      await controller.getDashboard({ user: { fullName: 'Test' } }, mockRes((b) => { emptyResult = b; }));

      service.getDashboardData = async () => populatedDto;
      await controller.getDashboard({ user: { fullName: 'Test' } }, mockRes((b) => { populatedResult = b; }));
    } finally {
      service.getDashboardData = originalGetDashboardData;
    }

    const expectedKeys = [
      'currentDate',
      'logistics',
      'managerName',
      'procurementWorkflow',
      'recentActivity',
      'reorderList',
      'stats',
      'status',
    ];
    assert.deepEqual(Object.keys(emptyResult).sort(), expectedKeys);
    assert.deepEqual(Object.keys(populatedResult).sort(), expectedKeys);
  });

  it('reconciles logistics rows with dispatch queue totals', () => {
    const orders = [
      { orderId: 'ORD-1', customer: 'Cust 1', status: 'to-pack', type: 'standard', items: [{ name: 'A', qty: 1 }] },
      { orderId: 'ORD-2', customer: 'Cust 2', status: 'to-pack', type: 'standard', items: [{ name: 'B', qty: 2 }] },
      { orderId: 'ORD-3', customer: 'Cust 3', status: 'ready', type: 'express', courier: 'FedEx', trackId: 'FX1', items: [{ name: 'C', qty: 1 }] },
      { orderId: 'ORD-4', customer: 'Cust 4', status: 'in-transit', type: 'standard', courier: 'UPS', trackId: 'UP1', items: [{ name: 'D', qty: 1 }] },
      { orderId: 'ORD-5', customer: 'Cust 5', status: 'completed', type: 'standard', items: [{ name: 'E', qty: 1 }] },
    ];

    const dispatchQueue = {
      total: orders.filter(o => o.status === 'to-pack' || o.status === 'ready').length,
      subStats: [
        { label: 'To Pack', value: orders.filter(o => o.status === 'to-pack').length },
        { label: 'Ready for Pickup', value: orders.filter(o => o.status === 'ready').length },
      ],
    };

    const logistics = orders.map(o => ({
      id: o.orderId,
      orderId: o.orderId,
      customer: o.customer,
      status: o.status,
      statusVersion: 0,
      type: o.type,
      courier: o.courier || '',
      trackId: o.trackId || '',
      itemCount: o.items.length,
    }));

    // Reconcile total
    const actionableLogisticsCount = logistics.filter(l => l.status === 'to-pack' || l.status === 'ready').length;
    assert.equal(dispatchQueue.total, actionableLogisticsCount);
    assert.equal(dispatchQueue.total, 3);

    // Reconcile sub-stats
    const toPackCount = logistics.filter(l => l.status === 'to-pack').length;
    const readyCount = logistics.filter(l => l.status === 'ready').length;
    assert.equal(dispatchQueue.subStats.find(s => s.label === 'To Pack').value, toPackCount);
    assert.equal(dispatchQueue.subStats.find(s => s.label === 'Ready for Pickup').value, readyCount);
  });
});

