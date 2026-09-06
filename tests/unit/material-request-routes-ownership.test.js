const assert = require('node:assert/strict');
const router = require('../../src/modules/inventory-manager/inventory_manager.routes');
const controller = require('../../src/modules/inventory-manager/inventory_manager.controller');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');

describe('Material Request Route Ownership & Retired Generic Path (IM-017)', () => {
  it('does not export generic updateMaterialRequest on controller or service', () => {
    assert.equal(
      controller.updateMaterialRequest,
      undefined,
      'controller.updateMaterialRequest should be completely removed'
    );
    assert.equal(
      service.updateMaterialRequest,
      undefined,
      'service.updateMaterialRequest should be completely removed'
    );
  });

  it('verifies every registered router route has an attached, defined handler', () => {
    const routeLayers = router.stack.filter((layer) => layer.route);
    assert.ok(routeLayers.length > 0, 'Router should have route layers');

    for (const layer of routeLayers) {
      const route = layer.route;
      const methods = Object.keys(route.methods).join(', ').toUpperCase();
      assert.ok(
        route.stack.length > 0,
        `Route [${methods}] ${route.path} must have at least one handler`
      );
      for (const handlerLayer of route.stack) {
        assert.equal(
          typeof handlerLayer.handle,
          'function',
          `Handler for [${methods}] ${route.path} must be a function`
        );
      }
    }
  });

  it('strictly mounts only canonical explicit material request command routes', () => {
    const materialRoutes = router.stack
      .filter((layer) => layer.route && layer.route.path.startsWith('/material-requests'))
      .map((layer) => {
        const method = Object.keys(layer.route.methods)[0].toUpperCase();
        return `${method} ${layer.route.path}`;
      });

    // Verify expected explicit command routes are mounted
    const expectedRoutes = [
      'GET /material-requests',
      'PATCH /material-requests/:id/items/:lineId',
      'POST /material-requests/:id/reserve',
      'POST /material-requests/:id/release',
      'POST /material-requests/:id/handover',
    ];

    assert.deepEqual(
      materialRoutes.sort(),
      expectedRoutes.sort(),
      'Material requests must only expose explicit command routes'
    );

    // Verify no generic PATCH or PUT /material-requests/:id exists
    const hasGenericUpdate = materialRoutes.some(
      (r) => r === 'PATCH /material-requests/:id' || r === 'PUT /material-requests/:id'
    );
    assert.equal(hasGenericUpdate, false, 'No generic update route should be mounted');
  });

  it('binds explicit material routes to canonical controller handlers', () => {
    assert.equal(typeof controller.getMaterialRequests, 'function');
    assert.equal(typeof controller.confirmMaterialItem, 'function');
    assert.equal(typeof controller.reserveMaterialRequest, 'function');
    assert.equal(typeof controller.releaseMaterialRequest, 'function');
    assert.equal(typeof controller.handoverMaterialRequest, 'function');

    assert.equal(typeof service.getMaterialRequests, 'function');
    assert.equal(typeof service.confirmMaterialItem, 'function');
    assert.equal(typeof service.reserveMaterialRequest, 'function');
    assert.equal(typeof service.releaseMaterialRequest, 'function');
    assert.equal(typeof service.handoverMaterialRequest, 'function');
  });
});
