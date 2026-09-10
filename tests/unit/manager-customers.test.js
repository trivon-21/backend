const assert = require('node:assert/strict');
const managerRouter = require('../../src/modules/manager/manager.routes');
const customersController = require('../../src/modules/manager/manager.customers.controller');
const customersService = require('../../src/modules/manager/manager.customers.service');

describe('Manager customers routes and controller unit tests', () => {
  function findRouteHandlers(method, path) {
    const layer = managerRouter.stack.find(
      (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods[method.toLowerCase()]
    );
    assert.ok(layer, `Route [${method.toUpperCase()}] ${path} must be registered on manager router`);
    return layer.route.stack.map((s) => s.handle);
  }

  it('registers GET /customers on manager router with listCustomers handler', () => {
    const handlers = findRouteHandlers('GET', '/customers');
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0], customersController.listCustomers);
  });

  it('registers GET /customers/:id on manager router with getCustomerDetails handler', () => {
    const handlers = findRouteHandlers('GET', '/customers/:id');
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0], customersController.getCustomerDetails);
  });

  it('controller listCustomers returns structured payload from service', async () => {
    const originalService = customersService.getCustomers;
    const mockData = {
      success: true,
      summary: {
        totalCustomers: 5,
        activeCustomers: 4,
        customersWithHistory: 3,
        totalInstances: 12,
      },
      customers: [
        {
          _id: '60d5ec49f1b2c8b1f8e4e1a1',
          fullName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phoneNumber: '0771234567',
          address: 'Colombo',
          totalInstances: 3,
          breakdown: { orders: 2, services: 1, installations: 0, inquiries: 0 },
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 15,
        totalPages: 1,
      },
    };

    customersService.getCustomers = async () => mockData;

    try {
      let jsonResult = null;
      const req = { query: { search: 'John', page: '1' } };
      const res = {
        json(payload) {
          jsonResult = payload;
          return this;
        },
        status() {
          return this;
        },
      };

      await customersController.listCustomers(req, res);
      assert.deepEqual(jsonResult, mockData);
    } finally {
      customersService.getCustomers = originalService;
    }
  });

  it('controller getCustomerDetails returns 400 on invalid customer ID format', async () => {
    let statusCode = null;
    let jsonResult = null;

    const req = { params: { id: 'invalid-id' } };
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

    await customersController.getCustomerDetails(req, res);
    assert.equal(statusCode, 400);
    assert.equal(jsonResult.success, false);
    assert.match(jsonResult.message, /Invalid customer ID format/);
  });
});
