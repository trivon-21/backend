const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Inventory = require('../../src/models/Inventory');
const SerializedAsset = require('../../src/models/SerializedAsset');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');

function catalogItem() {
  return new Inventory({
    _id: new mongoose.Types.ObjectId(),
    name: 'Existing Compressor',
    sku: 'COMP-EDIT-1',
    itemClass: 'Spare Parts',
    subcategory: 'Compressor',
    brand: 'Copeland',
    type: 'Single',
    unit: 'units',
    location: 'Central Warehouse',
    binLocation: 'Small Parts Racking',
    reorderLevel: 5,
    maxStockLevel: 20,
    unitCost: 100,
    capacityBtu: 18000,
    available: 0,
    reserved: 0,
    isSerialized: false,
    serialNumbers: [],
  });
}

describe('Inventory catalog updates', () => {
  it('saves the document so model synchronization runs', async () => {
    const originalFindById = Inventory.findById;
    const originalFindAssets = SerializedAsset.find;
    const item = catalogItem();
    let saved = false;

    Inventory.findById = async () => item;
    SerializedAsset.find = () => ({
      select() { return this; },
      sort() { return this; },
      lean: async () => [],
    });
    item.save = async function saveWithoutDatabase() {
      await this.validate();
      saved = true;
      return this;
    };
    item.populate = async function populateWithoutDatabase() {
      return this;
    };

    try {
      const result = await service.updateInventoryItem(String(item._id), {
        name: 'Updated Compressor',
        itemClass: 'Spare Parts',
        subcategory: 'Compressor',
        brand: 'Copeland',
        type: 'Single',
        unit: 'units',
        location: 'Central Warehouse',
        binLocation: 'Small Parts Racking',
        reorderLevel: 4,
        maxStockLevel: 25,
        unitCost: 250,
        capacityBtu: null,
      });

      assert.equal(saved, true);
      assert.equal(result.name, 'Updated Compressor');
      assert.equal(result.unitCost, 250);
      assert.equal(result.pricing.costPerUnit, 250);
      assert.equal(result.capacityBtu, null);
      assert.equal(result.category, 'Spare Parts');
    } finally {
      Inventory.findById = originalFindById;
      SerializedAsset.find = originalFindAssets;
    }
  });

  it('rejects arbitrary warehouses and placement areas', async () => {
    const originalFindById = Inventory.findById;
    const item = catalogItem();
    Inventory.findById = async () => item;

    try {
      await assert.rejects(
        service.updateInventoryItem(String(item._id), {
          location: 'Warehouse typed by a user',
          binLocation: 'Anywhere',
        }),
        (error) => error.code === 'INVALID_STORAGE_LOCATION' && error.statusCode === 400,
      );
    } finally {
      Inventory.findById = originalFindById;
    }
  });

  it('rejects receipts posted to an arbitrary storage location before starting a transaction', async () => {
    await assert.rejects(
      service.receiveInventory({
        receiptMode: 'PO',
        quantity: 1,
        location: 'Temporary Warehouse',
        binLocation: 'Floor',
      }, { role: 'INVENTORY' }),
      (error) => error.code === 'INVALID_STORAGE_LOCATION' && error.statusCode === 400,
    );
  });
});
