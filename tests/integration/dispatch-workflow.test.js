const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const service = require('../../src/modules/inventory-manager/inventory_manager.service');
const DispatchOrder = require('../../src/models/DispatchOrder');
const Activity = require('../../src/models/Activity');

const uri = process.env.INVENTORY_AUDIT_MONGO_URI;

async function resetAuditDatabase() {
  if (mongoose.connection.name !== 'airlux_inventory_audit') {
    throw new Error(`Refusing to reset unexpected database ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();
}

function fixture(orderId, overrides = {}) {
  return {
    orderId,
    customer: 'Fabricated Dispatch Customer',
    date: '2026-09-03',
    type: 'Delivery',
    status: 'to-pack',
    statusVersion: 0,
    items: [{ name: 'Fabricated Unit', sku: `${orderId}-SKU`, qty: 1, confirmed: false }],
    ...overrides,
  };
}

test('dispatch persistence enforces the versioned state machine and server timestamps', {
  skip: !uri,
}, async () => {
  await mongoose.connect(uri);
  try {
    await resetAuditDatabase();
    await Promise.all([DispatchOrder.init(), Activity.init()]);
    await DispatchOrder.create(fixture('AUDIT-DISPATCH-1'));

    await assert.rejects(
      () => service.updateOrder('AUDIT-DISPATCH-1', {
        status: 'ready', courier: 'Audit Courier', trackId: 'TRACK-1', statusVersion: 0,
      }),
      (error) => error.code === 'DISPATCH_ITEMS_NOT_CONFIRMED',
    );
    let updated = await service.updateOrder('AUDIT-DISPATCH-1', {
      items: [{ name: 'Fabricated Unit', sku: 'AUDIT-DISPATCH-1-SKU', qty: 1, confirmed: true }],
      statusVersion: 0,
    });
    assert.equal(updated.statusVersion, 1);

    await assert.rejects(
      () => service.updateOrder('AUDIT-DISPATCH-1', {
        status: 'ready', courier: 'Audit Courier', trackId: 'TRACK-1',
        lastMovedAt: new Date().toISOString(), statusVersion: 1,
      }),
      (error) => error.code === 'SERVER_MANAGED_DISPATCH_TIMESTAMP',
    );
    const beforeReady = Date.now();
    updated = await service.updateOrder('AUDIT-DISPATCH-1', {
      status: 'ready', courier: 'Audit Courier', trackId: 'TRACK-1', statusVersion: 1,
    });
    assert.equal(updated.status, 'ready');
    assert.equal(updated.statusVersion, 2);
    assert.ok(updated.lastMovedAt.getTime() >= beforeReady);

    await assert.rejects(
      () => service.updateOrder('AUDIT-DISPATCH-1', {
        status: 'completed', statusVersion: 2,
      }),
      (error) => error.code === 'INVALID_DISPATCH_TRANSITION',
    );
    updated = await service.updateOrder('AUDIT-DISPATCH-1', {
      courier: 'Updated Audit Courier', trackId: 'TRACK-2', statusVersion: 2,
    });
    assert.equal(updated.statusVersion, 3);
    assert.equal(updated.courier, 'Updated Audit Courier');

    updated = await service.updateOrder('AUDIT-DISPATCH-1', {
      status: 'in-transit', statusVersion: 3,
    });
    assert.equal(updated.statusVersion, 4);
    updated = await service.updateOrder('AUDIT-DISPATCH-1', {
      status: 'completed', statusVersion: 4,
    });
    assert.equal(updated.statusVersion, 5);
    assert.ok(updated.completedAt instanceof Date);

    await assert.rejects(
      () => service.updateOrder('AUDIT-DISPATCH-1', {
        status: 'ready', undo: true, statusVersion: 5,
      }),
      (error) => error.code === 'INVALID_DISPATCH_TRANSITION',
    );
    updated = await service.updateOrder('AUDIT-DISPATCH-1', {
      status: 'in-transit', undo: true, statusVersion: 5,
    });
    assert.equal(updated.statusVersion, 6);
    assert.equal(updated.completedAt, undefined);

    await DispatchOrder.create(fixture('AUDIT-DISPATCH-EXPIRED', {
      status: 'ready',
      courier: 'Audit Courier',
      trackId: 'TRACK-EXPIRED',
      items: [{ name: 'Fabricated Unit', sku: 'AUDIT-DISPATCH-EXPIRED-SKU', qty: 1, confirmed: true }],
      lastMovedAt: new Date(Date.now() - (61 * 60 * 1000)),
    }));
    await assert.rejects(
      () => service.updateOrder('AUDIT-DISPATCH-EXPIRED', {
        status: 'to-pack', undo: true, statusVersion: 0,
      }),
      (error) => error.code === 'DISPATCH_UNDO_EXPIRED',
    );

    await DispatchOrder.create(fixture('AUDIT-DISPATCH-RACE', {
      courier: 'Audit Courier',
      trackId: 'TRACK-RACE',
      items: [{ name: 'Fabricated Unit', sku: 'AUDIT-DISPATCH-RACE-SKU', qty: 1, confirmed: true }],
    }));
    const race = await Promise.allSettled([
      service.updateOrder('AUDIT-DISPATCH-RACE', { status: 'ready', statusVersion: 0 }),
      service.updateOrder('AUDIT-DISPATCH-RACE', { status: 'ready', statusVersion: 0 }),
    ]);
    assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
    const raceFailure = race.find((result) => result.status === 'rejected');
    assert.equal(raceFailure.reason.code, 'STALE_DISPATCH');
    assert.equal((await DispatchOrder.findOne({ orderId: 'AUDIT-DISPATCH-RACE' }).lean()).statusVersion, 1);

    assert.equal(await Activity.countDocuments({ type: 'dispatch' }), 5);
  } finally {
    if (mongoose.connection.readyState === 1) await resetAuditDatabase();
    await mongoose.disconnect();
  }
});
