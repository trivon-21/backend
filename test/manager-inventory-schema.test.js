const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AssetLoan = require('../src/models/AssetLoan');
const MaterialRequest = require('../src/models/MaterialRequest');
const Order = require('../src/models/Order');
const Ticket = require('../src/models/Ticket');
const OrderRequest = require('../src/models/OrderRequest');
const Procurement = require('../src/models/Procurement');
const ReceiptAuthorization = require('../src/models/ReceiptAuthorization');

const objectId = () => new mongoose.Types.ObjectId();

test('purchase lines reject fractional and over-received quantities', async () => {
  const request = new OrderRequest({
    requestId: 'REQ-SCHEMA-1', supplierName: 'Supplier', requestedBy: 'Inventory Manager',
    items: [{ name: 'Capacitor', sku: 'CAP-1', quantity: 2, orderedQuantity: 2, receivedQuantity: 3 }],
  });
  const error = await request.validate().catch((validationError) => validationError);
  assert.match(error.errors['items.0.receivedQuantity'].message, /cannot exceed ordered quantity/i);

  request.items[0].receivedQuantity = 0;
  request.items[0].quantity = 1.5;
  const fractionalError = await request.validate().catch((validationError) => validationError);
  assert.match(fractionalError.errors['items.0.quantity'].message, /validator failed/i);
});

test('receipt schemas require the reference appropriate to their mode', async () => {
  const poReceipt = new Procurement({
    receiptMode: 'PO', supplierName: 'Supplier', itemName: 'Capacitor', sku: 'CAP-1',
    quantity: 1, unit: 'units', receivedBy: 'Inventory Manager',
  });
  const poError = await poReceipt.validate().catch((validationError) => validationError);
  assert.match(poError.errors.orderRequestId.message, /require an order request/i);

  const nonPoReceipt = new Procurement({
    receiptMode: 'NON_PO', nonPoReason: 'LOCAL_PURCHASE', supplierName: 'Supplier',
    itemName: 'Capacitor', sku: 'CAP-1', quantity: 1, unit: 'units', receivedBy: 'Inventory Manager',
  });
  const nonPoError = await nonPoReceipt.validate().catch((validationError) => validationError);
  assert.match(nonPoError.errors.receiptAuthorizationId.message, /require an approved authorization/i);
});

test('receipt authorizations reject missing item sources and excess receipts', async () => {
  const authorization = new ReceiptAuthorization({
    authorizationNumber: 'NPO-SCHEMA-1', nonPoReason: 'LOCAL_PURCHASE', explanation: 'Urgent repair',
    supplierId: objectId(), supplierName: 'Supplier', authorizedQuantity: 2, receivedQuantity: 3,
    sourceDocumentNumber: 'DOC-1', requestedById: objectId(), requestedByName: 'Inventory Manager',
  });
  const error = await authorization.validate().catch((validationError) => validationError);
  assert.match(error.errors.inventoryId.message, /inventory item or new-item snapshot/i);
  assert.match(error.errors.receivedQuantity.message, /cannot exceed authorized quantity/i);
});

test('tool loans retain a legacy technician ID while validating the canonical User reference', () => {
  const loan = new AssetLoan({
    toolId: objectId(), toolName: 'Vacuum Pump', assetTag: 'TOOL-1', technicianId: 'legacy-free-text-id',
    technicianUserId: 'invalid-user-reference', technicianName: 'Technician', dueDate: new Date(Date.now() + 86400000),
  });
  assert.ok(loan.validateSync().errors.technicianUserId);
  assert.equal(loan.technicianId, 'legacy-free-text-id');
});

test('dispatch and material request item quantities are positive whole numbers', () => {
  const dispatch = new Order({
    orderId: 'ORD-SCHEMA-1', customer: 'Customer', date: '2026-08-15', type: 'Delivery',
    items: [{ name: 'Filter', sku: 'FILTER-1', qty: 0 }],
  });
  const material = new MaterialRequest({
    requestId: 'MAT-SCHEMA-1', requester: 'Technician', date: '2026-08-15', location: 'Job',
    items: [{ name: 'Filter', sku: 'FILTER-1', qty: 1.5 }],
  });
  assert.ok(dispatch.validateSync().errors['items.0.qty']);
  assert.ok(material.validateSync().errors['items.0.qty']);
});

test('ticket resolution timestamps follow the ticket status', async () => {
  const ticket = new Ticket({
    ticketId: 'T-1', subject: 'No cooling', customer: 'Customer', status: 'resolved',
  });
  await ticket.validate();
  assert.ok(ticket.resolvedAt instanceof Date);

  ticket.status = 'open';
  await ticket.validate();
  assert.equal(ticket.resolvedAt, undefined);
});
