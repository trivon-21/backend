const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = path.join(__dirname, 'database-schema.pdf');

const models = [
  {
    name: 'L_BankDetail',
    source: 'backend/src/modules/shared/L_bankDetails.model.js',
    description: 'Bank account information used for financial transactions and payments.',
    fields: [
      ['bankName', 'String'],
      ['branchName', 'String'],
      ['accountName', 'String'],
      ['accountNo', 'String'],
      ['type', 'String'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'L_Charge',
    source: 'backend/src/modules/shared/L_charges.model.js',
    description: 'Reusable service or installation charges.',
    fields: [
      ['name', 'String (required, unique)'],
      ['amount', 'Number (required)'],
      ['type', 'String enum: FIXED | PERCENTAGE'],
      ['description', 'String'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'L_Inventory',
    source: 'backend/src/modules/shared/L_inventories.model.js',
    description: 'Inventory catalog for materials and stock management.',
    fields: [
      ['name', 'String (required)'],
      ['category', 'String enum: Piping | Electrical | Mounting | Drainage | Safety | Tools | Consumables | Other'],
      ['unit', 'String'],
      ['costPerUnit', 'Number (required, min 0)'],
      ['description', 'String'],
      ['inStock', 'Boolean'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'L_SellingPrice',
    source: 'backend/src/modules/shared/L_sellingPrice.model.js',
    description: 'Selling-price setup linked one-to-one to inventory items.',
    fields: [
      ['inventoryId', 'ObjectId ref: L_Inventory (required, unique)'],
      ['inventoryName', 'String'],
      ['costPerUnit', 'Number (required)'],
      ['profitMargin', 'Number default 0.25'],
      ['sellingPricePerUnit', 'Number (required, auto-calculated)'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'L_PurchaseRequest',
    source: 'backend/src/modules/shared/L_purchaseRequest.model.js',
    description: 'Purchase requisitions raised by inventory or operations teams.',
    fields: [
      ['requestedBy', 'String'],
      ['requestedById', 'ObjectId ref: User'],
      ['requestedByEmail', 'String'],
      ['items', 'Array of { itemName, quantity, unitPrice, total }'],
      ['totalAmount', 'Number default 0'],
      ['reason', 'String'],
      ['status', 'String enum: PENDING | APPROVED | REJECTED'],
      ['rejectionReason', 'String'],
      ['approvedAt', 'Date'],
      ['rejectedAt', 'Date'],
      ['reviewedBy', 'String'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'L_Installation',
    source: 'backend/src/modules/shared/L_installations.model.js',
    description: 'Detailed installation jobs and site requirements.',
    fields: [
      ['orderId', 'ObjectId ref: Order'],
      ['inspectionTicketId', 'ObjectId ref: InspectionTicket'],
      ['customerId', 'ObjectId ref: User (required)'],
      ['assignedTeamId', 'Number'],
      ['assignedTeamName', 'String'],
      ['productType', 'String'],
      ['units', 'Number default 1'],
      ['location', 'String'],
      ['serviceDate', 'Date'],
      ['siteDetails', 'Embedded object { buildingType, floors, rooms, ceilingHeight, wallType, powerSupply, outdoorAccess }'],
      ['materials', 'Array of { item, quantity }'],
      ['financeNotes', 'String'],
      ['status', 'String enum: Pending | Assigned | In Progress | Completed | Cancelled'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'L_ServiceReport',
    source: 'backend/src/modules/shared/L_serviceReport.model.js',
    description: 'Maintenance/repair service report submitted after work completion.',
    fields: [
      ['customerId', 'ObjectId ref: User (required)'],
      ['customer', 'Embedded object { name, phone, email, address }'],
      ['type', 'String enum: MAINTENANCE | REPAIR (required)'],
      ['repairType', 'String enum: MINOR | MAJOR'],
      ['units', 'Number default 1'],
      ['productDetails', 'Embedded object { generalType, detailedType, description }'],
      ['location', 'String'],
      ['scheduledDate', 'Date'],
      ['materialsUsed', 'Array of { item, quantity }'],
      ['notesFromMainTechnician', 'String'],
      ['technicianComment', 'String'],
      ['finalStatus', 'String enum: Pending | In Progress | Completed | Cancelled'],
      ['submittedAt', 'Date'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'L_Repair',
    source: 'backend/src/modules/shared/L_repair.model.js',
    description: 'Repair work details linked to service tickets and orders.',
    fields: [
      ['serviceTicketId', 'ObjectId ref: ServiceTicket'],
      ['customerId', 'ObjectId ref: User'],
      ['orderId', 'ObjectId ref: Order'],
      ['repairType', 'String enum: minor | major'],
      ['materials', 'Array of { item, quantity }'],
      ['location', 'String'],
      ['notes', 'String'],
      ['status', 'String enum: PENDING | MATERIALS_READY | INVOICED'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'InspectionTicket',
    source: 'backend/src/modules/shared/ticket/InspectionTicket.model.js',
    description: 'Inspection request and payment workflow for customer orders.',
    fields: [
      ['orderId', 'ObjectId ref: Order (required)'],
      ['customerId', 'ObjectId ref: User (required)'],
      ['status', 'String enum: PENDING_PAYMENT | PAYMENT_UNDER_REVIEW | PAYMENT_CONFIRMED | PAYMENT_REJECTED | INSPECTION_SCHEDULED | ONGOING | REPORT_RECORDED | INSPECTED'],
      ['inspectionFee', 'Number default 5000'],
      ['slipUrl', 'String'],
      ['rejectionReason', 'String'],
      ['scheduledDate', 'Date'],
      ['slipUploadedAt', 'Date'],
      ['approvedAt', 'Date'],
      ['rejectedAt', 'Date'],
      ['scheduledAt', 'Date'],
      ['startedAt', 'Date'],
      ['inspectedAt', 'Date'],
      ['reminderSent', 'Boolean default false'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'ServiceTicket',
    source: 'backend/src/modules/shared/ticket/ServiceTicket.model.js',
    description: 'Service request ticket for maintenance or repair jobs.',
    fields: [
      ['customerId', 'ObjectId ref: User (required)'],
      ['orderId', 'ObjectId ref: Order'],
      ['serviceType', 'String enum: REPAIR | MAINTENANCE (required)'],
      ['description', 'String'],
      ['serviceFee', 'Number default 0'],
      ['paymentStatus', 'String enum: PENDING_PAYMENT | UNDER_REVIEW | APPROVED | REJECTED'],
      ['paymentSlipUrl', 'String'],
      ['rejectionReason', 'String'],
      ['slipUploadedAt', 'Date'],
      ['approvedAt', 'Date'],
      ['rejectedAt', 'Date'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'InspectionReport',
    source: 'backend/src/modules/inspection-team/InspectionReport.model.js',
    description: 'Detailed on-site inspection report with room-by-room assessments and photos.',
    fields: [
      ['ticketId', 'ObjectId ref: InspectionTicket (required)'],
      ['orderId', 'ObjectId ref: Order'],
      ['inspectorId', 'ObjectId ref: User'],
      ['customerName', 'String'],
      ['contactNumber', 'String'],
      ['siteAddress', 'String'],
      ['siteType', 'String'],
      ['inspectionDate', 'String'],
      ['siteStatus', 'String'],
      ['floorLevel', 'String'],
      ['elevatorAvailability', 'Boolean'],
      ['parkingAvailability', 'String'],
      ['rooms', 'Array of room objects with room measurements and installation conditions'],
      ['photos', 'Array of { name, dataUrl }'],
      ['inspectorName', 'String'],
      ['acknowledgeDate', 'String'],
      ['acknowledgeTime', 'String'],
      ['status', 'String enum: DRAFT | RECORDED | SUBMITTED'],
      ['submittedAt', 'Date'],
      ['recordedAt', 'Date'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'Invoice',
    source: 'backend/src/modules/finance/Invoice.model.js',
    description: 'Financial invoice for installation or repair work with payment lifecycle tracking.',
    fields: [
      ['orderId', 'ObjectId ref: Order'],
      ['customerId', 'ObjectId ref: User'],
      ['ticketId', 'ObjectId ref: InspectionTicket'],
      ['reportId', 'ObjectId ref: InspectionReport'],
      ['invoiceType', 'String enum: INSTALLATION | REPAIR'],
      ['repairId', 'ObjectId ref: L_Repair'],
      ['invoiceNumber', 'String unique'],
      ['invoiceDate', 'Date'],
      ['customerName', 'String'],
      ['customerEmail', 'String'],
      ['customerAddress', 'String'],
      ['items', 'Array of { no, itemName, description, qty, rate, amount }'],
      ['serviceCharge', 'Number'],
      ['subTotal', 'Number'],
      ['grandTotal', 'Number'],
      ['status', 'String enum: DRAFT | SENT | ACCEPTED | REJECTED | REJECTION_CANCELLED | PAID | AUTO_CANCELLED'],
      ['sentAt', 'Date'],
      ['acceptedAt', 'Date'],
      ['rejectedAt', 'Date'],
      ['paidAt', 'Date'],
      ['cancelledAt', 'Date'],
      ['rejectionReason', 'String'],
      ['rejectionDeadline', 'Date'],
      ['paymentDeadline', 'Date'],
      ['rejectionReminderSent', 'Boolean'],
      ['paymentReminderSent', 'Boolean'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  },
  {
    name: 'AuditLog',
    source: 'backend/src/modules/shared/audit/auditLog.model.js',
    description: 'Operational audit trail for payment, invoice and purchase request events.',
    fields: [
      ['eventType', 'String enum: PAYMENT_SUBMITTED | PAYMENT_APPROVED | PAYMENT_REJECTED | PAYMENT_RESUBMITTED | INVOICE_GENERATED | INVOICE_SENT | INVOICE_ACCEPTED | INVOICE_REJECTED | INVOICE_REJECTION_CANCELLED | INVOICE_PAID | INVOICE_AUTO_CANCELLED | SERVICE_PAYMENT_SUBMITTED | SERVICE_PAYMENT_APPROVED | SERVICE_PAYMENT_REJECTED | PURCHASE_REQUEST_APPROVED | PURCHASE_REQUEST_REJECTED'],
      ['paymentType', 'String enum: BUY_ONLY | INSPECTION | INVOICE | REPAIR | MAINTENANCE | PURCHASE_REQUEST'],
      ['orderId', 'String'],
      ['ticketId', 'String'],
      ['invoiceId', 'String'],
      ['customerId', 'ObjectId ref: User'],
      ['customerName', 'String'],
      ['customerEmail', 'String'],
      ['amount', 'Number'],
      ['rejectionReason', 'String'],
      ['slipUrl', 'String'],
      ['performedBy', 'String'],
      ['notes', 'String'],
      ['timestamps', 'createdAt, updatedAt']
    ]
  }
];

const relationshipSummary = [
  'User -> Order, InspectionTicket, ServiceTicket, L_Installation, L_ServiceReport, AuditLog',
  'Order -> InspectionTicket, L_Installation, Invoice',
  'InspectionTicket -> InspectionReport, Invoice',
  'ServiceTicket -> L_Repair, L_ServiceReport',
  'L_Inventory -> L_SellingPrice',
  'L_PurchaseRequest -> Finance approval workflow',
  'Invoice -> Payment lifecycle and FinanceReview / AuditLog'
];

function addWrappedText(doc, text, options = {}) {
  const lines = doc.widthOfString(text, options);
  if (lines > 0) {
    doc.text(text, options);
  }
}

function writeHeader(doc) {
  doc.fontSize(20).font('Helvetica-Bold').text('Trivon Project - Database Schema', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text('Generated from the backend Mongoose models and schema definitions.', { align: 'center' });
  doc.fontSize(9).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown(1);
}

function writeRelationshipSummary(doc) {
  doc.fontSize(12).font('Helvetica-Bold').text('Relationship Overview');
  doc.fontSize(10).font('Helvetica');
  relationshipSummary.forEach((line) => {
    doc.text(`• ${line}`);
  });
  doc.moveDown(1);
}

function writeModel(doc, model) {
  doc.fontSize(14).font('Helvetica-Bold').text(model.name);
  doc.fontSize(9).font('Helvetica-Oblique').text(model.source, { continued: false });
  doc.fontSize(10).font('Helvetica').text(model.description);
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica-Bold').text('Fields:');
  model.fields.forEach(([field, type]) => {
    doc.font('Helvetica').text(`- ${field}: ${type}`);
  });
  doc.moveDown(1);
}

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 40, bottom: 40, left: 40, right: 40 },
  layout: 'portrait'
});

const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

writeHeader(doc);
writeRelationshipSummary(doc);

models.forEach((model, index) => {
  if (index > 0 && index % 3 === 0) {
    doc.addPage();
  }
  writeModel(doc, model);
});

const footerText = 'Confidential internal schema reference for team collaboration';
doc.fontSize(8).font('Helvetica-Oblique').text(footerText, { align: 'center' });

doc.end();

console.log(`Database schema PDF generated at: ${outputPath}`);
