const assert = require('node:assert/strict');
const { buildDispatchMutation } = require('../../src/utils/dispatch-workflow');

describe('Dispatch workflow', () => {
  const now = new Date('2026-09-03T10:00:00.000Z');
  const base = {
    status: 'to-pack',
    statusVersion: 2,
    courier: '',
    trackId: '',
    items: [{ name: 'Fabricated Unit', sku: 'FAB-1', qty: 1, confirmed: true }],
  };

  it('allows every adjacent forward transition with server timestamps', () => {
    const ready = buildDispatchMutation(base, {
      status: 'ready', courier: 'Audit Courier', trackId: 'TRACK-1', statusVersion: 2,
    }, now);
    assert.equal(ready.set.status, 'ready');
    assert.equal(ready.set.lastMovedAt, now);

    const inTransit = buildDispatchMutation({
      ...base, status: 'ready', courier: 'Audit Courier', trackId: 'TRACK-1',
    }, { status: 'in-transit', statusVersion: 2 }, now);
    assert.equal(inTransit.set.status, 'in-transit');

    const completed = buildDispatchMutation({
      ...base, status: 'in-transit', courier: 'Audit Courier', trackId: 'TRACK-1',
    }, { status: 'completed', statusVersion: 2 }, now);
    assert.equal(completed.set.completedAt, now);
    assert.equal(completed.set.lastMovedAt, now);
  });

  it('allows only one adjacent undo within one hour', () => {
    for (const [from, to] of [
      ['ready', 'to-pack'],
      ['in-transit', 'ready'],
      ['completed', 'in-transit'],
    ]) {
      const result = buildDispatchMutation({
        ...base,
        status: from,
        courier: 'Audit Courier',
        trackId: 'TRACK-1',
        completedAt: from === 'completed' ? new Date('2026-09-03T09:30:00.000Z') : undefined,
        lastMovedAt: new Date('2026-09-03T09:30:00.000Z'),
      }, { status: to, undo: true, statusVersion: 2 }, now);
      assert.equal(result.set.status, to);
      assert.equal(result.set.lastMovedAt, now);
      if (from === 'completed') assert.equal(result.unset.completedAt, 1);
    }

    assert.throws(() => buildDispatchMutation({
      ...base,
      status: 'ready',
      lastMovedAt: new Date('2026-09-03T08:59:59.000Z'),
    }, { status: 'to-pack', undo: true, statusVersion: 2 }, now), (error) => (
      error.statusCode === 409 && error.code === 'DISPATCH_UNDO_EXPIRED'
    ));
  });

  it('rejects invalid jumps, reverse moves without undo, and stale versions', () => {
    for (const input of [
      { status: 'in-transit', statusVersion: 2 },
      { status: 'completed', statusVersion: 2 },
      { status: 'to-pack', statusVersion: 2 },
    ]) {
      const source = input.status === 'to-pack'
        ? { ...base, status: 'ready', courier: 'Audit Courier', trackId: 'TRACK-1' }
        : base;
      assert.throws(
        () => buildDispatchMutation(source, input, now),
        (error) => error.statusCode === 409 && error.code === 'INVALID_DISPATCH_TRANSITION',
      );
    }
    assert.throws(
      () => buildDispatchMutation(base, { items: base.items, statusVersion: 1 }, now),
      (error) => error.statusCode === 409 && error.code === 'STALE_DISPATCH',
    );
    assert.throws(
      () => buildDispatchMutation(base, { items: base.items }, now),
      (error) => error.statusCode === 409 && error.code === 'STALE_DISPATCH',
    );
  });

  it('requires confirmed immutable lines and complete shipping information', () => {
    assert.throws(() => buildDispatchMutation({
      ...base,
      items: [{ ...base.items[0], confirmed: false }],
    }, {
      status: 'ready', courier: 'Audit Courier', trackId: 'TRACK-1', statusVersion: 2,
    }, now), (error) => error.code === 'DISPATCH_ITEMS_NOT_CONFIRMED');

    assert.throws(() => buildDispatchMutation(base, {
      status: 'ready', courier: 'Audit Courier', trackId: '', statusVersion: 2,
    }, now), (error) => error.code === 'DISPATCH_SHIPPING_REQUIRED');

    assert.throws(() => buildDispatchMutation(base, {
      items: [{ ...base.items[0], qty: 2 }], statusVersion: 2,
    }, now), (error) => error.code === 'DISPATCH_ITEMS_IMMUTABLE');
  });

  it('rejects client timestamps and permits packing or ready-stage shipping edits', () => {
    assert.throws(() => buildDispatchMutation(base, {
      items: base.items, lastMovedAt: now.toISOString(), statusVersion: 2,
    }, now), (error) => error.statusCode === 400 && error.code === 'SERVER_MANAGED_DISPATCH_TIMESTAMP');

    const packed = buildDispatchMutation({
      ...base,
      items: [{ ...base.items[0], confirmed: false }],
    }, { items: base.items, statusVersion: 2 }, now);
    assert.equal(packed.set.items[0].confirmed, true);

    const shipping = buildDispatchMutation({
      ...base, status: 'ready', courier: 'Old Courier', trackId: 'OLD-1',
    }, { courier: 'New Courier', trackId: 'NEW-1', statusVersion: 2 }, now);
    assert.equal(shipping.set.courier, 'New Courier');
    assert.equal(shipping.set.trackId, 'NEW-1');
  });
});
