const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Activity = require('../../src/models/Activity');
const QuarantineItem = require('../../src/models/QuarantineItem');
const DispatchOrder = require('../../src/models/DispatchOrder');
const PurchaseRequest = require('../../src/models/PurchaseRequest');
const ReceiptAuthorization = require('../../src/models/ReceiptAuthorization');
const Supplier = require('../../src/models/Supplier');
const Inventory = require('../../src/models/Inventory');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');

describe('Transactional Activity History & Rollback Contract (AR-01 / Epic 18)', () => {
  let originalActivityCreate;
  let originalMongooseTransaction;
  let originalReadyState;

  beforeEach(() => {
    originalActivityCreate = Activity.create;
    originalMongooseTransaction = mongoose.connection.transaction;
    originalReadyState = mongoose.connection.readyState;
    mongoose.connection.readyState = 1;
  });

  afterEach(() => {
    Activity.create = originalActivityCreate;
    mongoose.connection.transaction = originalMongooseTransaction;
    mongoose.connection.readyState = originalReadyState;
  });

  function createTransactionSpy() {
    let aborted = false;
    let committed = false;
    const session = {
      id: 'mock-session-123',
    };

    mongoose.connection.transaction = async (work) => {
      try {
        const res = await work(session);
        committed = true;
        return res;
      } catch (err) {
        aborted = true;
        throw err;
      }
    };

    return {
      session,
      isAborted: () => aborted,
      isCommitted: () => committed,
    };
  }

  it('aborts and rolls back createQuarantineItem when Activity write fails', async () => {
    const spy = createTransactionSpy();
    let quarantineSaved = false;

    const originalSave = QuarantineItem.prototype.save;
    QuarantineItem.prototype.save = async function (opts) {
      assert.equal(opts?.session, spy.session, 'Session must be passed to QuarantineItem.save');
      quarantineSaved = true;
      return this;
    };

    Activity.create = async (docs, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to Activity.create');
      throw new Error('Injected Activity Persistence Failure');
    };

    try {
      await assert.rejects(
        service.createQuarantineItem({
          itemName: 'Defective Sensor',
          quantity: 2,
          reason: 'Short circuit',
        }, { role: 'INVENTORY' }),
        /Injected Activity Persistence Failure/
      );

      assert.equal(quarantineSaved, true, 'QuarantineItem.save was initially attempted');
      assert.equal(spy.isAborted(), true, 'Transaction must be aborted when Activity fails');
      assert.equal(spy.isCommitted(), false, 'Transaction must not be committed');
    } finally {
      QuarantineItem.prototype.save = originalSave;
    }
  });

  it('aborts and rolls back disposeQuarantineItem when Activity write fails', async () => {
    const spy = createTransactionSpy();
    const item = new QuarantineItem({
      _id: new mongoose.Types.ObjectId(),
      quarantineId: 'QZ-ROLLBACK-1',
      itemName: 'Broken Condenser',
      quantity: 1,
      unit: 'units',
      reason: 'Physical crack',
      status: 'quarantined',
    });

    const originalFindOneAndDelete = QuarantineItem.findOneAndDelete;
    QuarantineItem.findOneAndDelete = async (filter, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to QuarantineItem.findOneAndDelete');
      return item;
    };

    Activity.create = async (docs, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to Activity.create');
      throw new Error('Injected Activity write error on disposal');
    };

    try {
      await assert.rejects(
        service.disposeQuarantineItem(item.quarantineId, { role: 'INVENTORY' }),
        /Injected Activity write error on disposal/
      );

      assert.equal(spy.isAborted(), true, 'Transaction must be aborted when Activity write fails');
      assert.equal(spy.isCommitted(), false, 'Transaction must not be committed');
    } finally {
      QuarantineItem.findOneAndDelete = originalFindOneAndDelete;
    }
  });

  it('aborts and rolls back updateOrder dispatch transition when Activity write fails', async () => {
    const spy = createTransactionSpy();
    const orderId = 'ORD-2026-ROLLBACK';
    const mockOrder = {
      _id: new mongoose.Types.ObjectId(),
      orderId,
      status: 'to-pack',
      statusVersion: 1,
      courier: 'FedEx',
      trackId: 'TRK-123',
      items: [{ sku: 'SKU1', name: 'Item 1', qty: 1, confirmed: true }],
    };

    const originalFindOne = DispatchOrder.findOne;
    const originalFindOneAndUpdate = DispatchOrder.findOneAndUpdate;

    DispatchOrder.findOne = () => ({
      session(sess) {
        assert.equal(sess, spy.session, 'Session must be passed to DispatchOrder.findOne');
        return this;
      },
      lean: async () => mockOrder,
    });

    DispatchOrder.findOneAndUpdate = async (filter, update, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to DispatchOrder.findOneAndUpdate');
      return { ...mockOrder, ...update.$set, statusVersion: 2 };
    };

    Activity.create = async (docs, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to Activity.create');
      throw new Error('Injected Dispatch Activity Failure');
    };

    try {
      await assert.rejects(
        service.updateOrder(orderId, { status: 'ready', statusVersion: 1 }, { role: 'INVENTORY', fullName: 'Rollback Tester' }),
        /Injected Dispatch Activity Failure/
      );

      assert.equal(spy.isAborted(), true, 'Transaction must be aborted when Activity write fails');
      assert.equal(spy.isCommitted(), false, 'Transaction must not be committed');
    } finally {
      DispatchOrder.findOne = originalFindOne;
      DispatchOrder.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });

  it('aborts and rolls back createOrderRequest when Activity write fails', async () => {
    const spy = createTransactionSpy();
    const inventoryId = new mongoose.Types.ObjectId();
    const supplierId = new mongoose.Types.ObjectId();

    const originalFindSupplier = Supplier.findById;
    const originalCountInventory = Inventory.countDocuments;
    const originalSaveRequest = PurchaseRequest.prototype.save;

    Supplier.findById = async () => ({ _id: supplierId, name: 'Reliable Parts Co.' });
    Inventory.countDocuments = async () => 1;

    PurchaseRequest.prototype.save = async function (opts) {
      assert.equal(opts?.session, spy.session, 'Session must be passed to PurchaseRequest.save');
      return this;
    };

    Activity.create = async (docs, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to Activity.create');
      throw new Error('Injected Purchase Request Activity Failure');
    };

    try {
      await assert.rejects(
        service.createOrderRequest({
          supplierId: String(supplierId),
          supplierName: 'Reliable Parts Co.',
          items: [{
            inventoryId: String(inventoryId),
            quantity: 5,
            unitCost: 120,
          }],
        }, { _id: new mongoose.Types.ObjectId(), role: 'INVENTORY' }),
        /Injected Purchase Request Activity Failure/
      );

      assert.equal(spy.isAborted(), true, 'Transaction must be aborted when Activity write fails');
      assert.equal(spy.isCommitted(), false, 'Transaction must not be committed');
    } finally {
      Supplier.findById = originalFindSupplier;
      Inventory.countDocuments = originalCountInventory;
      PurchaseRequest.prototype.save = originalSaveRequest;
    }
  });

  it('aborts and rolls back createReceiptAuthorization when Activity write fails', async () => {
    const spy = createTransactionSpy();
    const supplierId = new mongoose.Types.ObjectId();
    const inventoryId = new mongoose.Types.ObjectId();

    const originalFindSupplier = Supplier.findById;
    const originalFindInventory = Inventory.findById;
    const originalAuthCreate = ReceiptAuthorization.create;

    Supplier.findById = async () => ({ _id: supplierId, name: 'Direct Vendor' });
    Inventory.findById = async () => ({ _id: inventoryId, name: 'Refrigerant R410A' });

    ReceiptAuthorization.create = async (docs, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to ReceiptAuthorization.create');
      return docs.map(d => ({
        ...d,
        _id: new mongoose.Types.ObjectId(),
        populate: async () => d,
      }));
    };

    Activity.create = async (docs, opts) => {
      assert.equal(opts?.session, spy.session, 'Session must be passed to Activity.create');
      throw new Error('Injected Authorization Activity Failure');
    };

    try {
      await assert.rejects(
        service.createReceiptAuthorization({
          authorizedQuantity: 10,
          unitCost: 25,
          nonPoReason: 'LOCAL_PURCHASE',
          explanation: 'Emergency direct local purchase for urgent maintenance',
          sourceDocumentNumber: 'DOC-LOCAL-999',
          supportingDocumentUrl: 'https://storage.airlux.internal/docs/doc-999.pdf',
          supplierId: String(supplierId),
          inventoryId: String(inventoryId),
        }, { _id: new mongoose.Types.ObjectId(), role: 'INVENTORY' }),
        /Injected Authorization Activity Failure/
      );

      assert.equal(spy.isAborted(), true, 'Transaction must be aborted when Activity write fails');
      assert.equal(spy.isCommitted(), false, 'Transaction must not be committed');
    } finally {
      Supplier.findById = originalFindSupplier;
      Inventory.findById = originalFindInventory;
      ReceiptAuthorization.create = originalAuthCreate;
    }
  });
});
