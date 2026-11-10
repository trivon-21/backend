const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DISPATCH_SERVICE_PATH = path.join(__dirname, '../../src/modules/inventory-manager/services/dispatch.service.js');

// dispatch.service.js is deliberately stock-neutral: "Advancing a dispatch
// stage moves no stock — the reservation already did." Nothing today writes
// a DispatchOrder from a sales order, so that premise isn't wired up yet
// (see AGENTS.md) — but dispatch itself must never start moving Inventory
// on its own, which would double-count against a future sales-order
// reservation writer. This is a structural lock, not a behavioural one: it
// reads the source rather than exercising it, so it also catches someone
// adding a *new* stock-touching helper file that dispatch.service.js pulls in.
describe('Dispatch stock neutrality (structural lock)', () => {
  it('dispatch.service.js never requires the Inventory model', () => {
    const source = fs.readFileSync(DISPATCH_SERVICE_PATH, 'utf8');
    assert.doesNotMatch(source, /require\(['"].*models\/Inventory['"]\)/);
  });

  it('dispatch.service.js never calls a method on the Inventory model', () => {
    const source = fs.readFileSync(DISPATCH_SERVICE_PATH, 'utf8');
    // Matches `Inventory.find(`, `Inventory.findOneAndUpdate(`, `new Inventory(`, etc.,
    // without false-flagging unrelated identifiers like invalidateInventoryScopes,
    // INVENTORY_CACHE_PREFIXES, or the 'INVENTORY' role string.
    assert.doesNotMatch(source, /(?:^|[^.\w])Inventory\s*[.(]/);
  });

  it('updateOrder performs no Inventory write when exercised end-to-end', async () => {
    // Belt-and-braces behavioural check: monkey-patch the real Inventory
    // model's mutating statics to throw if dispatch ever calls them.
    const Inventory = require('../../src/models/Inventory');
    const DispatchOrder = require('../../src/models/DispatchOrder');
    const Activity = require('../../src/models/Activity');
    const service = require('../../src/modules/inventory-manager/inventory_manager.service');

    const originalInventoryFindOneAndUpdate = Inventory.findOneAndUpdate;
    const originalInventoryUpdateOne = Inventory.updateOne;
    const originalDispatchFindOne = DispatchOrder.findOne;
    const originalDispatchFindOneAndUpdate = DispatchOrder.findOneAndUpdate;
    const originalActivityCreate = Activity.create;

    const mongoose = require('mongoose');
    const order = {
      _id: new mongoose.Types.ObjectId(),
      orderId: 'ORD-NEUTRAL-1',
      status: 'to-pack',
      statusVersion: 0,
      items: [{ sku: 'SKU-1', name: 'Item 1', qty: 1, confirmed: true }],
    };

    Inventory.findOneAndUpdate = () => { throw new Error('dispatch must never write Inventory'); };
    Inventory.updateOne = () => { throw new Error('dispatch must never write Inventory'); };
    DispatchOrder.findOne = () => ({ session: () => ({ lean: async () => order }) });
    DispatchOrder.findOneAndUpdate = async (filter, update) => ({ ...order, ...update.$set, statusVersion: 1 });
    Activity.create = async (docs) => docs;

    try {
      await service.updateOrder(
        'ORD-NEUTRAL-1',
        { status: 'ready', courier: 'Courier', trackId: 'TRK-1', statusVersion: 0 },
        { role: 'INVENTORY', fullName: 'Ivy' },
      );
    } finally {
      Inventory.findOneAndUpdate = originalInventoryFindOneAndUpdate;
      Inventory.updateOne = originalInventoryUpdateOne;
      DispatchOrder.findOne = originalDispatchFindOne;
      DispatchOrder.findOneAndUpdate = originalDispatchFindOneAndUpdate;
      Activity.create = originalActivityCreate;
    }
  });
});
