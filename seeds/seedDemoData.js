const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Supplier = require('../src/models/Supplier');
const Inventory = require('../src/models/Inventory');
const OrderRequest = require('../src/models/OrderRequest');
const Procurement = require('../src/models/Procurement');
const ReceiptAuthorization = require('../src/models/ReceiptAuthorization');
const Ticket = require('../src/models/Ticket');
const MaterialRequest = require('../src/models/MaterialRequest');
const AssetLoan = require('../src/models/AssetLoan');
const Activity = require('../src/models/Activity');
const Order = require('../src/models/Order');
const Logistics = require('../src/models/Logistics');
const LeftoverReturn = require('../src/models/LeftoverReturn');
const RmaCase = require('../src/models/RmaCase');
const QuarantineItem = require('../src/models/QuarantineItem');

const DEMO_SKUS = ['DEMO-CU-14', 'DEMO-CONT-32A', 'DEMO-R32-9KG', 'DEMO-VP-5CFM', 'DEMO-FILTER-163'];
const DEMO_SUPPLIERS = ['Demo HVAC Supplies', 'Demo Refrigeration Parts'];
const DEMO_REQUESTS = ['DEMO-REQ-PARTIAL', 'DEMO-REQ-PENDING'];
const DEMO_TICKETS = ['DEMO-TKT-1001', 'DEMO-TKT-1002', 'DEMO-TKT-1003'];
const DEMO_AUTHORIZATIONS = ['DEMO-AUTH-0001', 'DEMO-AUTH-0002'];

const now = new Date();
const hoursFromNow = (hours) => new Date(now.getTime() + hours * 60 * 60 * 1000);
const daysFromNow = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const id = () => new mongoose.Types.ObjectId();

async function upsertUser({ email, fullName, lastName, role }) {
  const passwordHash = await bcrypt.hash('Password123!', 10);
  return User.findOneAndUpdate(
    { email },
    { $set: { fullName, lastName, passwordHash, role, emailVerified: true, authMethods: ['email'] } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
}

async function seedDemoData() {
  await connectDB();

  const inventoryUser = await User.findOne({ email: 'priyantha@airlux.lk' });
  const managerUser = await User.findOne({ email: 'amal@airlux.lk' });
  if (!inventoryUser || !managerUser) throw new Error('Seed the Inventory Manager and Manager users first');

  const technician = await upsertUser({
    email: 'nimal.perera@airlux.lk', fullName: 'Nimal', lastName: 'Perera', role: 'MAIN_TECH',
  });
  const serviceTechnician = await upsertUser({
    email: 'kasun.silva@airlux.lk', fullName: 'Kasun', lastName: 'Silva', role: 'SERVICE_TEAM',
  });

  await Promise.all([
    Supplier.deleteMany({ name: { $in: DEMO_SUPPLIERS } }),
    Inventory.deleteMany({ sku: { $in: DEMO_SKUS } }),
    OrderRequest.deleteMany({ requestId: { $in: DEMO_REQUESTS } }),
    Ticket.deleteMany({ ticketId: { $in: DEMO_TICKETS } }),
    ReceiptAuthorization.deleteMany({ authorizationNumber: { $in: DEMO_AUTHORIZATIONS } }),
    MaterialRequest.deleteMany({ requestId: { $in: ['DEMO-MR-001', 'DEMO-MR-002', 'DEMO-MR-003'] } }),
    AssetLoan.deleteMany({ assetTag: { $in: ['DEMO-ASSET-VP-001'] } }),
    Activity.deleteMany({ title: /^Demo:/ }),
    Order.deleteMany({ orderId: { $in: ['DEMO-ORD-001', 'DEMO-ORD-002'] } }),
    Logistics.deleteMany({ label: { $in: ['Demo: To Pack', 'Demo: In Transit', 'Demo: Completed'] } }),
    LeftoverReturn.deleteMany({ returnId: 'DEMO-RET-001' }),
    RmaCase.deleteMany({ rmaId: 'DEMO-RMA-001' }),
    QuarantineItem.deleteMany({ quarantineId: 'DEMO-Q-001' }),
    Procurement.deleteMany({ sourceDocumentKey: /^demo:/ }),
  ]);

  const [hvacSupplier, refrigerationSupplier] = await Supplier.create([
    { name: DEMO_SUPPLIERS[0], contactPerson: 'Sahan Fernando', phone: '+94 71 555 1001', email: 'sales@demohvac.example', address: 'Colombo 03', status: 'active' },
    { name: DEMO_SUPPLIERS[1], contactPerson: 'Dilshan Jayasuriya', phone: '+94 77 555 1002', email: 'orders@demorefrigeration.example', address: 'Nugegoda', status: 'active' },
  ]);

  const [copperTube, contactor, refrigerant, vacuumPump, filterDrier] = await Inventory.create([
    {
      name: 'Copper Tube 1/4 Inch', sku: 'DEMO-CU-14', type: 'Single', category: 'Installation Materials', itemClass: 'Installation Materials', subcategory: 'Copper Tube / Line Set', brand: 'Mueller', manufacturerPartNumber: 'CU-14-ROLL', compatibleModels: ['Daikin FTKF50TV16', 'Midea MSAG-12CRN8'], systemType: 'Split', refrigerants: ['R32', 'R410A'], capacityBtu: 18000, voltage: '', phase: 'Not Applicable', available: 12, reserved: 4, location: 'Main Warehouse', binLocation: 'INST-A01', supplierId: hvacSupplier._id, unit: 'meters', reorderLevel: 20, maxStockLevel: 100, unitCost: 650, isSerialized: false, specsUrl: 'https://www.muellerstreamline.com/',
    },
    {
      name: '32A AC Contactor', sku: 'DEMO-CONT-32A', type: 'Single', category: 'Spare Parts', itemClass: 'Spare Parts', subcategory: 'Electrical Control', brand: 'Schneider Electric', manufacturerPartNumber: 'LC1D32', compatibleModels: ['Daikin VRV IV Outdoor Unit', 'Mitsubishi City Multi'], systemType: 'VRF/VRV', refrigerants: [], capacityBtu: 48000, voltage: '230 V', phase: 'Single Phase', available: 2, reserved: 1, location: 'Main Warehouse', binLocation: 'SP-E02', supplierId: hvacSupplier._id, unit: 'units', reorderLevel: 5, maxStockLevel: 20, unitCost: 8500, isSerialized: true, serialNumbers: ['DEMO-CONT-0001', 'DEMO-CONT-0002'], specsUrl: 'https://www.se.com/',
    },
    {
      name: 'R32 Refrigerant Cylinder', sku: 'DEMO-R32-9KG', type: 'Single', category: 'Consumables', itemClass: 'Consumables', subcategory: 'Refrigerant', brand: 'Daikin', manufacturerPartNumber: 'R32-9KG', compatibleModels: ['Daikin FTKF50TV16', 'Daikin FTKM35TV16'], systemType: 'Split', refrigerants: ['R32'], capacityBtu: 0, voltage: '', phase: 'Not Applicable', available: 2, reserved: 0, location: 'Main Warehouse', binLocation: 'REF-C01', supplierId: refrigerationSupplier._id, unit: 'cylinders', reorderLevel: 5, maxStockLevel: 20, unitCost: 18500, isSerialized: false, specsUrl: 'https://www.daikin.com/',
    },
    {
      name: 'Vacuum Pump 5 CFM', sku: 'DEMO-VP-5CFM', type: 'Single', category: 'Tools and Test Equipment', itemClass: 'Tools and Test Equipment', subcategory: 'Vacuum Pump', brand: 'Fieldpiece', manufacturerPartNumber: 'VPX7', compatibleModels: ['Split AC Service', 'VRF Commissioning'], systemType: 'Universal', refrigerants: [], capacityBtu: 0, voltage: '230 V', phase: 'Single Phase', available: 1, reserved: 0, location: 'Tool Room', binLocation: 'TOOLS-V01', supplierId: hvacSupplier._id, unit: 'units', reorderLevel: 1, maxStockLevel: 3, unitCost: 125000, isSerialized: true, serialNumbers: ['DEMO-VP-0001'], specsUrl: 'https://www.fieldpiece.com/',
    },
    {
      name: 'Filter Drier 1/4 Inch', sku: 'DEMO-FILTER-163', type: 'Single', category: 'Spare Parts', itemClass: 'Spare Parts', subcategory: 'Filter-Drier / Sight Glass', brand: 'Sporlan', manufacturerPartNumber: 'C-163-S', compatibleModels: ['Universal Split AC', 'R32 Service Line'], systemType: 'Universal', refrigerants: ['R32', 'R410A'], capacityBtu: 0, voltage: '', phase: 'Not Applicable', available: 25, reserved: 5, location: 'Main Warehouse', binLocation: 'SP-F04', supplierId: refrigerationSupplier._id, unit: 'units', reorderLevel: 10, maxStockLevel: 50, unitCost: 2400, isSerialized: false, specsUrl: 'https://www.parker.com/',
    },
  ]);

  const partialOrder = await OrderRequest.create({
    requestId: 'DEMO-REQ-PARTIAL',
    items: [
      { lineId: 'DEMO-LINE-CU', inventoryId: copperTube._id, name: copperTube.name, sku: copperTube.sku, itemClass: copperTube.itemClass, subcategory: copperTube.subcategory, unit: copperTube.unit, quantity: 20, orderedQuantity: 20, receivedQuantity: 8, unitCost: copperTube.unitCost, estimatedTotal: 13000 },
      { lineId: 'DEMO-LINE-CONT', inventoryId: contactor._id, name: contactor.name, sku: contactor.sku, itemClass: contactor.itemClass, subcategory: contactor.subcategory, unit: contactor.unit, quantity: 4, orderedQuantity: 4, receivedQuantity: 2, unitCost: contactor.unitCost, estimatedTotal: 17000 },
    ],
    supplierName: hvacSupplier.name, supplierId: hvacSupplier._id, totalEstimate: 30000, status: 'partially-received', requestedBy: inventoryUser.fullName, requestedById: inventoryUser._id, priority: 'normal', notes: 'Demo: replenishment for scheduled service work.', poNumber: 'PO-DEMO-0001', orderedAt: daysFromNow(-3), statusVersion: 2,
    operationalApproval: { status: 'approved', actorId: managerUser._id, actorName: managerUser.fullName, decidedAt: daysFromNow(-5) }, financialApproval: { status: 'approved', actorId: managerUser._id, actorName: managerUser.fullName, decidedAt: daysFromNow(-4) }, approvedBy: managerUser.fullName, approvedAt: daysFromNow(-5), decisionHistory: [{ stage: 'manager', decision: 'approved', actorId: managerUser._id, actorName: managerUser.fullName, comment: 'Demo approval', at: daysFromNow(-5) }, { stage: 'fulfillment', decision: 'po-issued', actorId: inventoryUser._id, actorName: inventoryUser.fullName, comment: 'PO-DEMO-0001', at: daysFromNow(-3) }], source: 'manual',
  });

  const pendingOrder = await OrderRequest.create({
    requestId: 'DEMO-REQ-PENDING',
    items: [{ lineId: 'DEMO-LINE-R32', inventoryId: refrigerant._id, name: refrigerant.name, sku: refrigerant.sku, itemClass: refrigerant.itemClass, subcategory: refrigerant.subcategory, unit: refrigerant.unit, quantity: 10, orderedQuantity: 10, receivedQuantity: 0, unitCost: refrigerant.unitCost, estimatedTotal: 185000 }],
    supplierName: refrigerationSupplier.name, supplierId: refrigerationSupplier._id, totalEstimate: 185000, status: 'pending-manager', requestedBy: inventoryUser.fullName, requestedById: inventoryUser._id, priority: 'urgent', notes: 'Demo: low stock before scheduled VRF maintenance campaign.', statusVersion: 1, operationalApproval: { status: 'pending' }, financialApproval: { status: 'pending' }, decisionHistory: [{ stage: 'manager', decision: 'submitted', actorId: inventoryUser._id, actorName: inventoryUser.fullName, comment: 'Demo urgent replenishment', at: daysFromNow(-1) }], source: 'low-stock',
  });

  await Procurement.create([
    { inventoryId: copperTube._id, receiptMode: 'PO', invoiceNumber: 'INV-DEMO-0001', poNumber: partialOrder.poNumber, orderRequestId: partialOrder._id, orderLineId: 'DEMO-LINE-CU', sourceDocumentNumber: 'DN-DEMO-0001', sourceDocumentKey: 'demo:copper:1', receiptEventId: 'demo-receipt-copper-1', supplierId: hvacSupplier._id, supplierName: hvacSupplier.name, itemName: copperTube.name, sku: copperTube.sku, itemClass: copperTube.itemClass, subcategory: copperTube.subcategory, brand: copperTube.brand, quantity: 8, unit: copperTube.unit, unitCost: copperTube.unitCost, totalCost: 5200, binLocation: copperTube.binLocation, receivedBy: inventoryUser.fullName, receivedDate: daysFromNow(-2), condition: 'Good' },
    { inventoryId: contactor._id, receiptMode: 'PO', invoiceNumber: 'INV-DEMO-0001', poNumber: partialOrder.poNumber, orderRequestId: partialOrder._id, orderLineId: 'DEMO-LINE-CONT', sourceDocumentNumber: 'DN-DEMO-0001', sourceDocumentKey: 'demo:contactor:1', receiptEventId: 'demo-receipt-contactor-1', supplierId: hvacSupplier._id, supplierName: hvacSupplier.name, itemName: contactor.name, sku: contactor.sku, itemClass: contactor.itemClass, subcategory: contactor.subcategory, brand: contactor.brand, quantity: 2, unit: contactor.unit, unitCost: contactor.unitCost, totalCost: 17000, binLocation: contactor.binLocation, receivedBy: inventoryUser.fullName, receivedDate: daysFromNow(-2), condition: 'Good' },
  ]);

  await ReceiptAuthorization.create([
    { authorizationNumber: 'DEMO-AUTH-0001', nonPoReason: 'EMERGENCY_REPAIR', explanation: 'Demo urgent contactor replacement for an active customer repair.', inventoryId: contactor._id, supplierId: hvacSupplier._id, supplierName: hvacSupplier.name, authorizedQuantity: 1, receivedQuantity: 0, unitCost: contactor.unitCost, estimatedTotal: contactor.unitCost, affectedWorkType: 'REPAIR', affectedWorkReference: 'JOB-DEMO-0001', sourceDocumentNumber: 'EM-REQ-DEMO-0001', requestedById: inventoryUser._id, requestedByName: inventoryUser.fullName, status: 'approved', approvedById: managerUser._id, approvedByName: managerUser.fullName, approvedAt: daysFromNow(-1), approvalComment: 'Demo emergency approval', financeReviewStatus: 'pending', statusVersion: 1 },
    { authorizationNumber: 'DEMO-AUTH-0002', nonPoReason: 'LOCAL_PURCHASE', explanation: 'Demo local purchase requested because supplier lead time exceeds job date.', inventoryId: filterDrier._id, supplierId: refrigerationSupplier._id, supplierName: refrigerationSupplier.name, authorizedQuantity: 6, receivedQuantity: 0, unitCost: filterDrier.unitCost, estimatedTotal: 14400, affectedWorkType: 'MAINTENANCE', affectedWorkReference: 'MAINT-DEMO-0002', sourceDocumentNumber: 'LP-REQ-DEMO-0002', requestedById: inventoryUser._id, requestedByName: inventoryUser.fullName, status: 'pending', financeReviewStatus: 'pending', statusVersion: 0 },
  ]);

  await Ticket.create([
    { ticketId: 'DEMO-TKT-1001', subject: 'Urgent condenser not starting', description: 'Customer reports repeated breaker trips on outdoor unit.', customer: 'Colombo Office Tower', category: 'repair', priority: 'high', status: 'escalated', assignedTo: '', slaDueAt: hoursFromNow(-4) },
    { ticketId: 'DEMO-TKT-1002', subject: 'Split AC installation survey', description: 'Confirm indoor unit position and line-set requirements.', customer: 'Lake View Residence', category: 'installation', priority: 'medium', status: 'open', assignedTo: '', slaDueAt: hoursFromNow(18) },
    { ticketId: 'DEMO-TKT-1003', subject: 'Quarterly VRF maintenance', description: 'Complete filter and refrigerant inspection.', customer: 'Cinnamon Grand Annex', category: 'maintenance', priority: 'medium', status: 'in-progress', assignedTo: technician.fullName, assignedTechnicianId: technician._id, slaDueAt: daysFromNow(2) },
  ]);

  await MaterialRequest.create([
    { requestId: 'DEMO-MR-001', requester: technician.fullName, date: now.toISOString().substring(0, 10), location: 'Cinnamon Grand Annex', status: 'pending', items: [{ name: copperTube.name, qty: 8, confirmed: false, sku: copperTube.sku }], serviceTeam: 'Field Service Team' },
    { requestId: 'DEMO-MR-002', requester: serviceTechnician.fullName, date: daysFromNow(-1).toISOString().substring(0, 10), location: 'Lake View Residence', status: 'reserved', items: [{ name: filterDrier.name, qty: 2, confirmed: true, sku: filterDrier.sku }], serviceTeam: 'Installation Team', lastMovedAt: daysFromNow(-1) },
    { requestId: 'DEMO-MR-003', requester: technician.fullName, date: daysFromNow(-4).toISOString().substring(0, 10), location: 'Colombo Office Tower', status: 'completed', items: [{ name: refrigerant.name, qty: 1, confirmed: true, sku: refrigerant.sku }], serviceTeam: 'Field Service Team', completedAt: daysFromNow(-2).toISOString(), lastMovedAt: daysFromNow(-2) },
  ]);

  await AssetLoan.create({ toolId: vacuumPump._id, toolName: vacuumPump.name, assetTag: 'DEMO-ASSET-VP-001', technicianId: 'TECH-DEMO-001', technicianUserId: technician._id, technicianName: technician.fullName, checkedOutAt: daysFromNow(-1), dueDate: daysFromNow(4) });

  await Order.create([
    { orderId: 'DEMO-ORD-001', customer: 'Lake View Residence', date: now.toISOString().substring(0, 10), type: 'Installation', status: 'to-pack', items: [{ name: copperTube.name, qty: 8, confirmed: false, sku: copperTube.sku }] },
    { orderId: 'DEMO-ORD-002', customer: 'Cinnamon Grand Annex', date: daysFromNow(-2).toISOString().substring(0, 10), type: 'Service Replacement', status: 'in-transit', courier: 'AirLux Field Team', trackId: 'ALX-DEMO-002', items: [{ name: contactor.name, qty: 1, confirmed: true, sku: contactor.sku }], lastMovedAt: daysFromNow(-1) },
  ]);

  await Logistics.create([
    { label: 'Demo: To Pack', current: 4, total: 12, subLabel: 'Orders awaiting packing' },
    { label: 'Demo: In Transit', current: 3, total: 8, subLabel: 'Dispatches on the road' },
    { label: 'Demo: Completed', current: 18, total: 20, subLabel: 'Delivered this month' },
  ]);

  await LeftoverReturn.create({ returnId: 'DEMO-RET-001', jobId: 'JOB-DEMO-0004', itemId: copperTube._id, itemName: copperTube.name, itemSku: copperTube.sku, quantityReturned: 3, condition: 'good', returnedBy: technician.fullName, notes: 'Demo unused line-set material returned from installation.', restoredToStock: true });
  await RmaCase.create({ rmaId: 'DEMO-RMA-001', inventoryId: contactor._id, serialNumber: 'DEMO-CONT-0001', itemName: contactor.name, itemSku: contactor.sku, faultDescription: 'Demo contactor coil intermittently fails to engage.', reportedBy: technician.fullName, status: 'under-review', type: 'Single' });
  await QuarantineItem.create({ quarantineId: 'DEMO-Q-001', itemName: filterDrier.name, quantity: 1, unit: filterDrier.unit, reason: 'Demo dented packaging awaiting inspection.', location: 'Quarantine Shelf Q-01', source: 'manual' });

  await Activity.create([
    { type: 'request', title: 'Demo: Purchase Request Submitted', description: `${pendingOrder.requestId} submitted for Manager approval`, actionLabel: 'View Request' },
    { type: 'request', title: 'Demo: Purchase Order Partially Received', description: `${partialOrder.poNumber} has outstanding stock`, actionLabel: 'Receive Stock' },
    { type: 'grn', title: 'Demo: Goods Received', description: `8 meters of ${copperTube.name} received from ${hvacSupplier.name}`, actionLabel: 'View GRN' },
    { type: 'alert', title: 'Demo: Low Stock Alert', description: `${refrigerant.name} is below reorder level`, actionLabel: 'View Inventory' },
    { type: 'dispatch', title: 'Demo: Dispatch In Transit', description: 'DEMO-ORD-002 is with the AirLux Field Team', actionLabel: 'View Logistics' },
  ]);

  console.log('Demo data seeded successfully.');
  console.log('Preserved role users:', 'priyantha@airlux.lk', 'amal@airlux.lk');
  console.log('Demo technician accounts:', 'nimal.perera@airlux.lk', 'kasun.silva@airlux.lk');
  await mongoose.disconnect();
}

seedDemoData().catch(async (error) => {
  console.error('Demo seed failed:', error);
  await mongoose.disconnect();
  process.exit(1);
});
