const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const controller = require('../../src/modules/shared/jobMaterialRequest/jobMaterialRequest.controller');
const JobMaterialRequest = require('../../src/models/JobMaterialRequest');
const WarehousePickRequest = require('../../src/models/WarehousePickRequest');
const ServiceRequest = require('../../src/modules/shared/repair/repair.model');
const Inventory = require('../../src/models/Inventory');

describe('sendToInventoryManager unit test', () => {
  const originalJmrFindOne = JobMaterialRequest.findOne;
  const originalJmrFindOneAndUpdate = JobMaterialRequest.findOneAndUpdate;
  const originalServiceRequestFindOne = ServiceRequest.findOne;
  const originalServiceRequestFindByIdAndUpdate = ServiceRequest.findByIdAndUpdate;
  const originalWprFindOne = WarehousePickRequest.findOne;
  const originalWprCreate = WarehousePickRequest.create;
  const originalInventoryFindOne = Inventory.findOne;

  afterEach(() => {
    JobMaterialRequest.findOne = originalJmrFindOne;
    JobMaterialRequest.findOneAndUpdate = originalJmrFindOneAndUpdate;
    ServiceRequest.findOne = originalServiceRequestFindOne;
    ServiceRequest.findByIdAndUpdate = originalServiceRequestFindByIdAndUpdate;
    WarehousePickRequest.findOne = originalWprFindOne;
    WarehousePickRequest.create = originalWprCreate;
    Inventory.findOne = originalInventoryFindOne;
  });

  it('successfully creates WarehousePickRequest and updates JMR and job status', async () => {
    const fakeJobId = new mongoose.Types.ObjectId();
    const fakeJmrId = new mongoose.Types.ObjectId();
    const fakeInventoryId = new mongoose.Types.ObjectId();
    let createdWpr = null;
    let savedJmr = null;

    JobMaterialRequest.findOne = async () => ({
      _id: fakeJmrId,
      requestId: 'JMR-12345',
      jobId: fakeJobId,
      jobType: 'Repair',
      save: async function() { savedJmr = this; return this; }
    });

    ServiceRequest.findOne = () => ({
      lean: async () => ({
        _id: fakeJobId,
        ticketId: 'ST-100',
        location: 'Colombo Site 1',
        materials: [{ item: 'Air Filter', quantity: 2 }]
      })
    });

    Inventory.findOne = () => ({
      lean: async () => ({
        _id: fakeInventoryId,
        name: 'Air Filter',
        sku: 'SKU-FILTER-01'
      })
    });

    JobMaterialRequest.findOneAndUpdate = async (filter, update) => {
      return {
        _id: fakeJmrId,
        requestId: 'JMR-12345',
        jobId: fakeJobId,
        save: async function() { savedJmr = this; return this; }
      };
    };

    WarehousePickRequest.findOne = async () => null;

    WarehousePickRequest.create = async (doc) => {
      createdWpr = { ...doc, _id: new mongoose.Types.ObjectId() };
      return createdWpr;
    };

    ServiceRequest.findByIdAndUpdate = async () => ({ acknowledged: true });

    const req = {
      params: { id: 'JMR-12345' },
      body: {
        serviceRequestId: 'ST-100',
        materials: [{ item: 'Air Filter', quantity: 2 }]
      },
      user: {
        _id: new mongoose.Types.ObjectId(),
        fullName: 'Main Tech'
      }
    };

    let responseData = null;
    const res = {
      json: (data) => { responseData = data; },
      status: (code) => ({
        json: (data) => { responseData = { status: code, ...data }; }
      })
    };

    await controller.sendToInventoryManager(req, res);

    assert.ok(responseData, 'Controller should send a response');
    assert.equal(responseData.success, true, 'Response should indicate success');
    assert.equal(responseData.data.status, 'Sent to IM');
    assert.ok(createdWpr, 'WarehousePickRequest should have been created');
    assert.equal(createdWpr.status, 'pending');
    assert.equal(createdWpr.jobType, 'Repair');
    assert.equal(createdWpr.items[0].name, 'Air Filter');
    assert.equal(createdWpr.items[0].sku, 'SKU-FILTER-01');
    assert.equal(createdWpr.items[0].qty, 2);
  });
});
