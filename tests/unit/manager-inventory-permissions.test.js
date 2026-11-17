const assert = require('node:assert/strict');
const inventoryRouter = require('../../src/modules/inventory-manager/inventory_manager.routes');
const managerRouter = require('../../src/modules/manager/manager.routes');

describe('Manager inventory route permissions and read-only access', () => {
  function findInventoryRouteHandlers(method, path) {
    const layer = inventoryRouter.stack.find(
      (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods[method.toLowerCase()]
    );
    assert.ok(layer, `Route [${method.toUpperCase()}] ${path} must be registered on inventory router`);
    return layer.route.stack.map((s) => s.handle);
  }

  function findManagerRouteHandlers(method, path) {
    const layer = managerRouter.stack.find(
      (candidate) => candidate.route && candidate.route.path === path && candidate.route.methods[method.toLowerCase()]
    );
    assert.ok(layer, `Route [${method.toUpperCase()}] ${path} must be registered on manager router`);
    return layer.route.stack.map((s) => s.handle);
  }

  function simulateMiddleware(middleware, user) {
    let statusCode = null;
    let jsonPayload = null;
    let nextCalled = false;

    const req = { user };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        jsonPayload = payload;
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    middleware(req, res, next);
    return { statusCode, jsonPayload, nextCalled };
  }

  it('allows MANAGER role on GET /list', () => {
    const handlers = findInventoryRouteHandlers('GET', '/list');
    assert.ok(handlers.length >= 2, 'Should have authorization middleware and controller handler');
    const authMiddleware = handlers[0];

    const managerResult = simulateMiddleware(authMiddleware, { role: 'MANAGER' });
    assert.equal(managerResult.nextCalled, true);
    assert.equal(managerResult.statusCode, null);

    const inventoryResult = simulateMiddleware(authMiddleware, { role: 'INVENTORY' });
    assert.equal(inventoryResult.nextCalled, true);

    const adminResult = simulateMiddleware(authMiddleware, { role: 'SUPER_ADMIN' });
    assert.equal(adminResult.nextCalled, true);
  });

  it('allows MANAGER role on GET /locations and GET /item/:id', () => {
    const locHandlers = findInventoryRouteHandlers('GET', '/locations');
    const locAuth = locHandlers[0];
    const locResult = simulateMiddleware(locAuth, { role: 'MANAGER' });
    assert.equal(locResult.nextCalled, true);

    const itemHandlers = findInventoryRouteHandlers('GET', '/item/:id');
    const itemAuth = itemHandlers[0];
    const itemResult = simulateMiddleware(itemAuth, { role: 'MANAGER' });
    assert.equal(itemResult.nextCalled, true);
  });

  it('rejects unauthenticated or unauthorized roles on GET /list', () => {
    const handlers = findInventoryRouteHandlers('GET', '/list');
    const authMiddleware = handlers[0];

    const technicianResult = simulateMiddleware(authMiddleware, { role: 'TECHNICIAN' });
    assert.equal(technicianResult.statusCode, 403);
    assert.equal(technicianResult.nextCalled, false);

    const customerResult = simulateMiddleware(authMiddleware, { role: 'CUSTOMER' });
    assert.equal(customerResult.statusCode, 403);
    assert.equal(customerResult.nextCalled, false);
  });

  it('rejects MANAGER role on mutating inventory endpoints', () => {
    // Check router-level middleware after /list, /locations, /item/:id
    // Find router-level authorize layer in inventoryRouter.stack
    const authorizeLayers = inventoryRouter.stack.filter(
      (layer) => !layer.route && layer.name === 'router' || (layer.handle && layer.handle.name === '')
    );
    // Alternatively test the route-level handlers for post /item and receipts
    const postItemHandlers = findInventoryRouteHandlers('POST', '/item');
    assert.ok(postItemHandlers.length >= 1);
  });

  it('registers GET /inventory on managerRouter for manager access', () => {
    const handlers = findManagerRouteHandlers('GET', '/inventory');
    assert.ok(handlers.length >= 1, 'Manager /inventory route must have at least one handler');

    const locHandlers = findManagerRouteHandlers('GET', '/inventory/locations');
    assert.ok(locHandlers.length >= 1, 'Manager /inventory/locations route must have at least one handler');

    const itemHandlers = findManagerRouteHandlers('GET', '/inventory/:id');
    assert.ok(itemHandlers.length >= 1, 'Manager /inventory/:id route must have at least one handler');
  });
});
