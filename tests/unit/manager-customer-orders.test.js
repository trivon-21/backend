'use strict';

const assert = require('node:assert/strict');
const managerRouter = require('../../src/modules/manager/manager.routes');
const customerOrdersController = require('../../src/modules/manager/manager.customer-orders.controller');
const customerOrdersService = require('../../src/modules/manager/manager.customer-orders.service');

describe('Manager customer orders and lookup routes unit tests', () => {
  function findRouteHandlers(method, path) {
    const layer = managerRouter.stack.find(
      (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods[method.toLowerCase()]
    );
    assert.ok(layer, `Route [${method.toUpperCase()}] ${path} must be registered on manager router`);
    return layer.route.stack.map((s) => s.handle);
  }

  it('registers GET /orders/lookup on manager router with lookupOrder handler', () => {
    const handlers = findRouteHandlers('GET', '/orders/lookup');
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0], customerOrdersController.lookupOrder);
  });

  it('registers GET /recent-orders on manager router with getRecentOrders handler', () => {
    const handlers = findRouteHandlers('GET', '/recent-orders');
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0], customerOrdersController.getRecentOrders);
  });

  it('lookupOrder returns 400 when ref query param is missing or empty', async () => {
    let statusCode = null;
    let jsonResult = null;

    const req = { query: { ref: '   ' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonResult = payload;
        return this;
      },
    };

    await customerOrdersController.lookupOrder(req, res);
    assert.equal(statusCode, 400);
    assert.equal(jsonResult.success, false);
    assert.match(jsonResult.message, /Order reference or ID query parameter/);
  });

  it('lookupOrder calls service and returns structured order response', async () => {
    const originalLookup = customerOrdersService.lookupOrder;
    const mockOrder = {
      success: true,
      data: {
        id: '60d5ec49f1b2c8b1f8e4e1a1',
        category: 'Product Order',
        reference: 'SRQ-1008',
        orderType: 'Repair',
        status: 'Completed',
        paymentStatus: 'Approved',
        orderStatus: 'Delivered',
        customer: {
          id: 'user123',
          fullName: 'John Doe',
          email: 'john@example.com',
          phoneNumber: '0771234567',
          address: '123 Main St',
        },
        items: [],
        total: 12000,
        createdAt: new Date().toISOString(),
      },
    };

    customerOrdersService.lookupOrder = async (ref) => {
      assert.equal(ref, 'SRQ-1008');
      return mockOrder;
    };

    try {
      let jsonResult = null;
      const req = { query: { ref: 'SRQ-1008' } };
      const res = {
        json(payload) {
          jsonResult = payload;
          return this;
        },
        status() {
          return this;
        },
      };

      await customerOrdersController.lookupOrder(req, res);
      assert.deepEqual(jsonResult, mockOrder);
    } finally {
      customerOrdersService.lookupOrder = originalLookup;
    }
  });

  it('getRecentOrders calls service and returns orders array', async () => {
    const originalRecent = customerOrdersService.getRecentCustomerOrders;
    const mockOrders = [
      {
        id: 'order1',
        category: 'Product Order',
        reference: 'ORD-1234',
        customerName: 'Alice',
        total: 50000,
        status: 'Pending',
        createdAt: new Date().toISOString(),
      },
    ];

    customerOrdersService.getRecentCustomerOrders = async ({ limit }) => {
      assert.equal(limit, 10);
      return mockOrders;
    };

    try {
      let jsonResult = null;
      const req = { query: { limit: '10' } };
      const res = {
        json(payload) {
          jsonResult = payload;
          return this;
        },
        status() {
          return this;
        },
      };

      await customerOrdersController.getRecentOrders(req, res);
      assert.equal(jsonResult.success, true);
      assert.equal(jsonResult.count, 1);
      assert.deepEqual(jsonResult.orders, mockOrders);
    } finally {
      customerOrdersService.getRecentCustomerOrders = originalRecent;
    }
  });
});
