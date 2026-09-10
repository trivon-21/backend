const assert = require('node:assert/strict');
const managerRouter = require('../../src/modules/manager/manager.routes');

describe('Manager operations route permissions and read-only access', () => {
  function findRouteHandlers(method, path) {
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

  it('rejects MANAGER role with 403 on PATCH /work-items/:sourceType/:sourceId/control and allows SUPER_ADMIN', () => {
    const handlers = findRouteHandlers('PATCH', '/work-items/:sourceType/:sourceId/control');
    assert.equal(handlers.length, 2, 'Should have authorization middleware and controller handler');

    const authMiddleware = handlers[0];

    // Manager role should be rejected with 403
    const managerResult = simulateMiddleware(authMiddleware, { role: 'MANAGER' });
    assert.equal(managerResult.statusCode, 403);
    assert.equal(managerResult.nextCalled, false);
    assert.match(managerResult.jsonPayload.message, /Access denied/);

    // Super Admin role should be allowed through
    const adminResult = simulateMiddleware(authMiddleware, { role: 'SUPER_ADMIN' });
    assert.equal(adminResult.nextCalled, true);
    assert.equal(adminResult.statusCode, null);
  });

  it('rejects MANAGER role with 403 on POST /work-items/:sourceType/:sourceId/:action and allows SUPER_ADMIN', () => {
    const handlers = findRouteHandlers('POST', '/work-items/:sourceType/:sourceId/:action');
    assert.equal(handlers.length, 2, 'Should have authorization middleware and controller handler');

    const authMiddleware = handlers[0];

    // Manager role should be rejected with 403
    const managerResult = simulateMiddleware(authMiddleware, { role: 'MANAGER' });
    assert.equal(managerResult.statusCode, 403);
    assert.equal(managerResult.nextCalled, false);
    assert.match(managerResult.jsonPayload.message, /Access denied/);

    // Super Admin role should be allowed through
    const adminResult = simulateMiddleware(authMiddleware, { role: 'SUPER_ADMIN' });
    assert.equal(adminResult.nextCalled, true);
    assert.equal(adminResult.statusCode, null);
  });

  it('rejects MANAGER role with 403 on legacy PATCH /tickets/:id and allows SUPER_ADMIN', () => {
    const handlers = findRouteHandlers('PATCH', '/tickets/:id');
    assert.equal(handlers.length, 2, 'Should have authorization middleware and controller handler');

    const authMiddleware = handlers[0];

    // Manager role should be rejected with 403
    const managerResult = simulateMiddleware(authMiddleware, { role: 'MANAGER' });
    assert.equal(managerResult.statusCode, 403);
    assert.equal(managerResult.nextCalled, false);

    // Super Admin role should be allowed through
    const adminResult = simulateMiddleware(authMiddleware, { role: 'SUPER_ADMIN' });
    assert.equal(adminResult.nextCalled, true);
  });
});
