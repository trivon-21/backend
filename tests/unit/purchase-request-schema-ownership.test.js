const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const CanonicalPurchaseRequest = require('../../src/models/PurchaseRequest');
const LegacyAdapterModel = require('../../src/modules/shared/L_purchaseRequest.model');
const financialReportController = require('../../src/modules/finance/financialReport.controller');

describe('Purchase Request Schema Ownership and Single-Writer Contract (AR-03 / Epic 20)', () => {
  it('registers PurchaseRequest and ManagerInventoryPurchaseRequest pointing to the canonical schema', () => {
    assert.ok(mongoose.models.PurchaseRequest, 'PurchaseRequest must be registered in mongoose.models');
    assert.ok(mongoose.models.ManagerInventoryPurchaseRequest, 'ManagerInventoryPurchaseRequest must be registered in mongoose.models');

    assert.equal(
      mongoose.models.PurchaseRequest.schema,
      CanonicalPurchaseRequest.schema,
      'PurchaseRequest must use the canonical schema'
    );
    assert.equal(
      mongoose.models.ManagerInventoryPurchaseRequest.schema,
      CanonicalPurchaseRequest.schema,
      'ManagerInventoryPurchaseRequest must share the exact same canonical schema'
    );
  });

  it('targets the purchase_requests collection exclusively with optimistic concurrency enabled', () => {
    const schema = CanonicalPurchaseRequest.schema;
    assert.equal(schema.options.collection, 'purchase_requests');
    assert.equal(schema.options.optimisticConcurrency, true, 'Optimistic concurrency must be enabled');
    assert.ok(schema.path('statusVersion'), 'statusVersion field must be present');
    assert.ok(schema.path('requestId'), 'requestId field must be present');
    assert.ok(schema.path('items'), 'items array must be present');
  });

  it('legacy L_purchaseRequest.model module re-exports the canonical PurchaseRequest without a duplicate schema', () => {
    assert.equal(
      LegacyAdapterModel,
      CanonicalPurchaseRequest,
      'L_purchaseRequest.model must re-export the canonical PurchaseRequest model'
    );
    assert.equal(
      mongoose.models.L_PurchaseRequest,
      CanonicalPurchaseRequest,
      'mongoose.models.L_PurchaseRequest must alias to the canonical PurchaseRequest'
    );
  });

  it('financial reporting controller queries canonical PurchaseRequest and projects fields accurately', async () => {
    require('../../src/modules/finance/Invoice.model');
    const Invoice = mongoose.model('Invoice');
    const originalInvoiceFind = Invoice.find;
    const originalInvoiceAggregate = Invoice.aggregate;
    Invoice.find = () => ({
      then(res) { res([]); },
      reduce(fn, initial) { return initial; },
    });
    Invoice.aggregate = async () => [];

    const Ticket = mongoose.models.InspectionTicket;
    const originalTicketFind = Ticket ? Ticket.find : null;
    if (Ticket) Ticket.find = async () => [];

    const ServiceTicket = mongoose.models.ServiceTicket;
    const originalServiceTicketFind = ServiceTicket ? ServiceTicket.find : null;
    if (ServiceTicket) ServiceTicket.find = async () => [];

    const Order = mongoose.models.Order;
    const originalOrderFind = Order ? Order.find : null;
    if (Order) Order.find = async () => [];

    const mockPurchases = [
      {
        _id: new mongoose.Types.ObjectId(),
        requestId: 'REQ-2026-CANONICAL-1',
        requestedBy: 'Bob Builder',
        totalEstimate: 1500,
        status: 'approved',
        approvedAt: new Date('2026-08-15T10:00:00Z'),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        requestId: 'REQ-2026-LEGACY-2',
        requestedBy: 'Alice Engineer',
        totalAmount: 2500,
        status: 'APPROVED',
        approvedAt: new Date('2026-08-16T12:00:00Z'),
      },
    ];

    const originalFind = CanonicalPurchaseRequest.find;
    CanonicalPurchaseRequest.find = () => ({
      async lean() {
        return mockPurchases;
      },
      then(resolve) {
        resolve(mockPurchases);
      },
      reduce(fn, initial) {
        return mockPurchases.reduce(fn, initial);
      },
    });

    try {
      let revenueBody = null;
      const resRevenue = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          revenueBody = data;
          return this;
        },
      };

      // Query revenue summary with date filter covering mock dates
      await financialReportController.getRevenueSummary({
        query: { startDate: '2026-08-01', endDate: '2026-08-31' },
      }, resRevenue);

      assert.ok(revenueBody, 'Revenue summary must return a response');
      // 1500 + 2500 = 4000
      assert.equal(revenueBody.purchaseExpenses, 4000, 'Must sum totalEstimate and totalAmount across approved purchases');

      let collectionsBody = null;
      const resCollections = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          collectionsBody = data;
          return this;
        },
      };

      await financialReportController.getPaymentCollections({
        query: { startDate: '2026-08-01', endDate: '2026-08-31' },
      }, resCollections);

      assert.ok(Array.isArray(collectionsBody), 'Collections must return an array');
      const expenses = collectionsBody.filter(c => c.type === 'Purchase Expense');
      assert.equal(expenses.length, 2);
      assert.equal(expenses[0].reference, 'REQ-2026-LEGACY-2');
      assert.equal(expenses[0].amount, -2500);
      assert.equal(expenses[1].reference, 'REQ-2026-CANONICAL-1');
      assert.equal(expenses[1].amount, -1500);
    } finally {
      CanonicalPurchaseRequest.find = originalFind;
      Invoice.find = originalInvoiceFind;
      Invoice.aggregate = originalInvoiceAggregate;
      if (Ticket && originalTicketFind) Ticket.find = originalTicketFind;
      if (ServiceTicket && originalServiceTicketFind) ServiceTicket.find = originalServiceTicketFind;
      if (Order && originalOrderFind) Order.find = originalOrderFind;
    }
  });
});
