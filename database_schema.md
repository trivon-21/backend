# Airlux Database Schema Documentation

This document provides a comprehensive overview of the MongoDB collections, models, fields, types, and validation constraints in the Airlux database.

## CATALOG\CART.MODEL.JS

### `Cart` (Collection: `carts`)
* **File Path**: [`catalog\cart.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/catalog\cart.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `additionalCharges` | `Number` | - | Default: `0` |
| `items` | `Array` | - | - |
| `userId` | `ObjectId` | Required, Unique | References `User` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## CATALOG\INSTALLATIONORDER.MODEL.JS

### `InstallationOrder` (Collection: `installation_orders`)
* **File Path**: [`catalog\installationOrder.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/catalog\installationOrder.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `additionalCharges` | `Number` | - | Default: `0` |
| `consultationCompleted` | `Boolean` | - | Default: `false` |
| `inspectionFee` | `Number` | - | Default: `0` |
| `items` | `Array` | - | - |
| `orderReference` | `String` | Required, Unique | - |
| `shippingDetails` | `Embedded` | - | - |
| `status` | `String` | - | Enum: [`"Pending Review"`, `"Awaiting Quote"`, `"Awaiting Inspection"`, `"Confirmed"`, `"Cancelled"`] | Default: `"Pending Review"` |
| `subtotal` | `Number` | Required | - |
| `total` | `Number` | Required | - |
| `userId` | `ObjectId` | Required | References `User` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## CATALOG\ORDER.MODEL.JS

### `Order` (Collection: `orders`)
* **File Path**: [`catalog\order.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/catalog\order.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `additionalCharges` | `Number` | - | Default: `0` |
| `consultationCompleted` | `Boolean` | - | Default: `false` |
| `items` | `Array` | - | - |
| `orderReference` | `String` | Unique | - |
| `paymentSlipUrl` | `String` | - | - |
| `shippingDetails` | `Embedded` | - | - |
| `status` | `String` | - | Enum: [`"Pending Payment"`, `"Under Review (Finance)"`, `"Confirmed"`, `"Cancelled"`] | Default: `"Pending Payment"` |
| `subtotal` | `Number` | Required | - |
| `total` | `Number` | Required | - |
| `userId` | `ObjectId` | Required | References `User` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## CATALOG\PRODUCT.MODEL.JS

### `Product` (Collection: `products`)
* **File Path**: [`catalog\product.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/catalog\product.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `averageRating` | `Number` | - | Default: `0` |
| `brand` | `String` | Required | - |
| `capacity` | `Number` | Required | - |
| `category` | `String` | Required | - |
| `description` | `String` | - | - |
| `features` | `Array<String>` | - | - |
| `image` | `String` | - | - |
| `images` | `Array<String>` | - | - |
| `inStock` | `Boolean` | - | Default: `true` |
| `name` | `String` | Required | - |
| `price` | `Number` | Required | - |
| `reviewCount` | `Number` | - | Default: `0` |
| `reviews` | `Array` | - | - |
| `specs` | `Array` | - | - |
| `variants` | `Array` | - | - |
| `warrantyInfo.comprehensive` | `String` | - | - |
| `warrantyInfo.compressor` | `String` | - | - |
| `warrantyInfo.covered` | `Array<String>` | - | - |
| `warrantyInfo.notCovered` | `Array<String>` | - | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\INSPECTIONREPORT.MODEL.JS

### `InspectionReport` (Collection: `inspection_reports`)
* **File Path**: [`field-service\inspectionReport.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\inspectionReport.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `acknowledgeDate` | `String` | - | - |
| `acknowledgeTime` | `String` | - | - |
| `contactNumber` | `String` | - | - |
| `customerName` | `String` | - | - |
| `elevatorAvailability` | `Boolean` | - | - |
| `floorLevel` | `String` | - | - |
| `inspectionDate` | `String` | - | - |
| `inspectorId` | `ObjectId` | - | References `User` |
| `inspectorName` | `String` | - | - |
| `orderId` | `ObjectId` | - | References `InstallationOrder` |
| `parkingAvailability` | `String` | - | - |
| `photos` | `Array` | - | - |
| `recordedAt` | `Date` | - | - |
| `rooms` | `Array<Mixed>` | - | - |
| `siteAddress` | `String` | - | - |
| `siteStatus` | `String` | - | - |
| `siteType` | `String` | - | - |
| `status` | `String` | - | Enum: [`"DRAFT"`, `"RECORDED"`, `"SUBMITTED"`] | Default: `"DRAFT"` |
| `submittedAt` | `Date` | - | - |
| `ticketId` | `ObjectId` | Required | References `InspectionTicket` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\INSPECTIONTICKET.MODEL.JS

### `InspectionTicket` (Collection: `inspection_tickets`)
* **File Path**: [`field-service\inspectionTicket.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\inspectionTicket.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `approvedAt` | `Date` | - | - |
| `customerId` | `ObjectId` | Required | References `User` |
| `inspectedAt` | `Date` | - | - |
| `inspectionFee` | `Number` | - | Default: `5000` |
| `orderId` | `ObjectId` | Required | References `InstallationOrder` |
| `rejectedAt` | `Date` | - | - |
| `rejectionReason` | `String` | - | - |
| `reminderSent` | `Boolean` | - | Default: `false` |
| `scheduledAt` | `Date` | - | - |
| `scheduledDate` | `Date` | - | - |
| `slipUploadedAt` | `Date` | - | - |
| `slipUrl` | `String` | - | - |
| `startedAt` | `Date` | - | - |
| `status` | `String` | - | Enum: [`"PENDING_PAYMENT"`, `"PAYMENT_UNDER_REVIEW"`, `"PAYMENT_CONFIRMED"`, `"PAYMENT_REJECTED"`, `"INSPECTION_SCHEDULED"`, `"ONGOING"`, `"REPORT_RECORDED"`, `"INSPECTED"`] | Default: `"PENDING_PAYMENT"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\INSTALLATION.MODEL.JS

### `Installation` (Collection: `installations`)
* **File Path**: [`field-service\installation.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\installation.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `assignedTeamId` | `ObjectId` | - | References `TechTeam` |
| `assignedTeamName` | `String` | - | - |
| `customerId` | `ObjectId` | Required | References `User` |
| `financeNotes` | `String` | - | - |
| `inspectionTicketId` | `ObjectId` | - | References `InspectionTicket` |
| `location` | `String` | - | - |
| `materials` | `Array` | - | - |
| `orderId` | `ObjectId` | - | References `InstallationOrder` |
| `productType` | `String` | - | - |
| `serviceDate` | `Date` | - | - |
| `siteDetails.buildingType` | `String` | - | - |
| `siteDetails.ceilingHeight` | `String` | - | - |
| `siteDetails.floors` | `Number` | - | - |
| `siteDetails.outdoorAccess` | `Boolean` | - | - |
| `siteDetails.powerSupply` | `String` | - | - |
| `siteDetails.rooms` | `Number` | - | - |
| `siteDetails.wallType` | `String` | - | - |
| `status` | `String` | - | Enum: [`"Pending"`, `"Assigned"`, `"In Progress"`, `"Completed"`, `"Cancelled"`] | Default: `"Pending"` |
| `units` | `Number` | - | Default: `1` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\JOBMATERIALREQUEST.MODEL.JS

### `JobMaterialRequest` (Collection: `job_material_requests`)
* **File Path**: [`field-service\jobMaterialRequest.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\jobMaterialRequest.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `items` | `Array` | - | - |
| `jobId` | `ObjectId` | - | - |
| `jobType` | `String` | - | Enum: [`"Installation"`, `"Maintenance"`, `"Repair"`] |
| `requestedBy` | `ObjectId` | - | References `User` |
| `status` | `String` | - | Enum: [`"PENDING"`, `"APPROVED"`, `"REJECTED"`] | Default: `"PENDING"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\MAINTENANCE.MODEL.JS

### `Maintenance` (Collection: `maintenances`)
* **File Path**: [`field-service\maintenance.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\maintenance.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `assignedTeamId` | `ObjectId` | - | References `TechTeam` |
| `customerId` | `ObjectId` | Required | References `User` |
| `date` | `Date` | Required | - |
| `isUnderWarranty` | `Boolean` | - | Default: `true` |
| `maintenanceType` | `String` | - | Enum: [`"Company Initiated"`, `"Customer Initiated"`] |
| `materialList` | `Array` | - | - |
| `serviceReport.photos` | `Array<String>` | - | - |
| `serviceReport.submittedAt` | `Date` | - | - |
| `serviceReport.technicianNotes` | `String` | - | - |
| `status` | `String` | - | Enum: [`"New"`, `"Finance Approved"`, `"Scheduled"`, `"In Progress"`, `"Completed"`] | Default: `"New"` |
| `ticketId` | `String` | Required, Unique | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\MAINTENANCESCHEDULE.MODEL.JS

### `MaintenanceSchedule` (Collection: `maintenance_schedules`)
* **File Path**: [`field-service\maintenanceSchedule.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\maintenanceSchedule.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `customerId` | `ObjectId` | Required | References `User` |
| `installationId` | `ObjectId` | - | References `Installation` |
| `services` | `Array` | - | - |
| `status` | `String` | - | Enum: [`"New"`, `"Draft Saved"`, `"Sent to CSA"`, `"Sent to Customer"`] | Default: `"New"` |
| `ticketId` | `String` | Required, Unique | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\REPAIR.MODEL.JS

### `Repair` (Collection: `repairs`)
* **File Path**: [`field-service\repair.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\repair.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `customerId` | `ObjectId` | - | References `User` |
| `location` | `String` | - | - |
| `materials` | `Array` | - | - |
| `notes` | `String` | - | - |
| `orderId` | `ObjectId` | - | References `Order` |
| `repairType` | `String` | - | Enum: [`"minor"`, `"major"`] |
| `serviceTicketId` | `ObjectId` | - | References `ServiceTicket` |
| `status` | `String` | - | Enum: [`"PENDING"`, `"MATERIALS_READY"`, `"INVOICED"`] | Default: `"PENDING"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\SERVICEREPORT.MODEL.JS

### `ServiceReport` (Collection: `service_reports`)
* **File Path**: [`field-service\serviceReport.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\serviceReport.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `customer.address` | `String` | - | - |
| `customer.email` | `String` | - | - |
| `customer.name` | `String` | - | - |
| `customer.phone` | `String` | - | - |
| `customerId` | `ObjectId` | Required | References `User` |
| `finalStatus` | `String` | - | Enum: [`"Pending"`, `"In Progress"`, `"Completed"`, `"Cancelled"`] | Default: `"Pending"` |
| `location` | `String` | - | - |
| `materialsUsed` | `Array` | - | - |
| `notesFromMainTechnician` | `String` | - | - |
| `productDetails.description` | `String` | - | - |
| `productDetails.detailedType` | `String` | - | - |
| `productDetails.generalType` | `String` | - | - |
| `repairType` | `String` | - | Enum: [`"MINOR"`, `"MAJOR"`] |
| `scheduledDate` | `Date` | - | - |
| `submittedAt` | `Date` | - | - |
| `technicianComment` | `String` | - | - |
| `type` | `String` | Required | Enum: [`"MAINTENANCE"`, `"REPAIR"`] |
| `units` | `Number` | - | Default: `1` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\SERVICETICKET.MODEL.JS

### `ServiceTicket` (Collection: `service_tickets`)
* **File Path**: [`field-service\serviceTicket.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\serviceTicket.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `approvedAt` | `Date` | - | - |
| `assignedTechnicianId` | `ObjectId` | - | References `User` |
| `category` | `String` | - | Enum: [`"installation"`, `"repair"`, `"maintenance"`, `"inspection"`] | Default: `"repair"` |
| `customerId` | `ObjectId` | Required | References `User` |
| `description` | `String` | Required | - |
| `orderId` | `ObjectId` | - | References `Order` |
| `paymentSlipUrl` | `String` | - | - |
| `paymentStatus` | `String` | - | Enum: [`"PENDING_PAYMENT"`, `"UNDER_REVIEW"`, `"APPROVED"`, `"REJECTED"`] |
| `priority` | `String` | - | Enum: [`"high"`, `"medium"`, `"low"`] | Default: `"medium"` |
| `rejectedAt` | `Date` | - | - |
| `rejectionReason` | `String` | - | - |
| `requestType` | `String` | Required | Enum: [`"Maintenance"`, `"Repair"`] |
| `resolvedAt` | `Date` | - | - |
| `serviceFee` | `Number` | - | Default: `0` |
| `serviceType` | `String` | - | Enum: [`"REPAIR"`, `"MAINTENANCE"`] |
| `slaDueAt` | `Date` | - | - |
| `slipUploadedAt` | `Date` | - | - |
| `status` | `String` | - | Enum: [`"New"`, `"Reviewed"`, `"Assigned"`, `"open"`, `"in-progress"`, `"resolved"`, `"escalated"`, `"Rejected"`] | Default: `"New"` |
| `subject` | `String` | - | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\TECHTEAM.MODEL.JS

### `TechTeam` (Collection: `tech_teams`)
* **File Path**: [`field-service\techTeam.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\techTeam.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `specialization` | `String` | - | - |
| `status` | `String` | - | Enum: [`"Available"`, `"On Job"`, `"Inactive"`] | Default: `"Available"` |
| `teamName` | `String` | Required | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FIELD-SERVICE\TECHTEAMMEMBER.MODEL.JS

### `TechTeamMember` (Collection: `tech_team_members`)
* **File Path**: [`field-service\techTeamMember.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/field-service\techTeamMember.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `contactNumber` | `String` | - | - |
| `name` | `String` | Required | - |
| `role` | `String` | - | Enum: [`"Lead"`, `"Assistant"`, `"Driver"`] |
| `teamId` | `ObjectId` | Required | References `TechTeam` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## FINANCE\INVOICE.MODEL.JS

### `Invoice` (Collection: `invoices`)
* **File Path**: [`finance\invoice.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/finance\invoice.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `acceptedAt` | `Date` | - | - |
| `cancelledAt` | `Date` | - | - |
| `customerAddress` | `String` | - | - |
| `customerEmail` | `String` | - | - |
| `customerId` | `ObjectId` | - | References `User` |
| `customerName` | `String` | - | - |
| `grandTotal` | `Number` | - | - |
| `invoiceDate` | `Date` | - | - |
| `invoiceNumber` | `String` | Unique | - |
| `invoiceType` | `String` | - | Enum: [`"INSTALLATION"`, `"REPAIR"`] |
| `items` | `Array` | - | - |
| `orderId` | `ObjectId` | - | References `Order` |
| `paidAt` | `Date` | - | - |
| `paymentDeadline` | `Date` | - | - |
| `paymentReminderSent` | `Boolean` | - | - |
| `rejectedAt` | `Date` | - | - |
| `rejectionDeadline` | `Date` | - | - |
| `rejectionReason` | `String` | - | - |
| `rejectionReminderSent` | `Boolean` | - | - |
| `repairId` | `ObjectId` | - | References `Repair` |
| `reportId` | `ObjectId` | - | References `InspectionReport` |
| `sentAt` | `Date` | - | - |
| `serviceCharge` | `Number` | - | - |
| `status` | `String` | - | Enum: [`"DRAFT"`, `"SENT"`, `"ACCEPTED"`, `"REJECTED"`, `"REJECTION_CANCELLED"`, `"PAID"`, `"AUTO_CANCELLED"`] | Default: `"DRAFT"` |
| `subTotal` | `Number` | - | - |
| `ticketId` | `ObjectId` | - | References `InspectionTicket` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## SHARED\AUDITLOG.MODEL.JS

### `AuditLog` (Collection: `audit_logs`)
* **File Path**: [`shared\auditLog.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/shared\auditLog.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `after` | `Mixed` | - | - |
| `amount` | `Number` | - | - |
| `before` | `Mixed` | - | Default: `null` |
| `customerEmail` | `String` | - | - |
| `customerId` | `ObjectId` | - | References `User` |
| `customerName` | `String` | - | - |
| `eventType` | `String` | Required | Enum: [`"UPDATE_BANK_DETAILS"`, `"PAYMENT_SUBMITTED"`, `"PAYMENT_APPROVED"`, `"PAYMENT_REJECTED"`, `"PAYMENT_RESUBMITTED"`, `"INVOICE_GENERATED"`, `"INVOICE_SENT"`, `"INVOICE_ACCEPTED"`, `"INVOICE_REJECTED"`, `"INVOICE_REJECTION_CANCELLED"`, `"INVOICE_PAID"`, `"INVOICE_AUTO_CANCELLED"`, `"SERVICE_PAYMENT_SUBMITTED"`, `"SERVICE_PAYMENT_APPROVED"`, `"SERVICE_PAYMENT_REJECTED"`, `"PURCHASE_REQUEST_APPROVED"`, `"PURCHASE_REQUEST_REJECTED"`] |
| `invoiceId` | `String` | - | - |
| `notes` | `String` | - | - |
| `orderId` | `String` | - | - |
| `paymentType` | `String` | - | Enum: [`"BUY_ONLY"`, `"INSPECTION"`, `"INVOICE"`, `"REPAIR"`, `"MAINTENANCE"`, `"PURCHASE_REQUEST"`] |
| `performedBy` | `String` | - | - |
| `rejectionReason` | `String` | - | - |
| `resource` | `String` | - | Default: `"PaymentSetting"` |
| `slipUrl` | `String` | - | - |
| `ticketId` | `String` | - | - |
| `timestamp` | `Date` | - | Default: `"[Function]"` |
| `updatedBy` | `ObjectId` | - | References `User` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## SHARED\BANKDETAIL.MODEL.JS

### `BankDetail` (Collection: `bank_details`)
* **File Path**: [`shared\bankDetail.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/shared\bankDetail.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `accountName` | `String` | Required | - |
| `accountNumber` | `String` | Required | - |
| `bankName` | `String` | Required | - |
| `branch` | `String` | Required | - |
| `currency` | `String` | - | Default: `"LKR"` |
| `type` | `String` | - | - |
| `updatedBy` | `ObjectId` | Required | References `User` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## SHARED\CHARGE.MODEL.JS

### `Charge` (Collection: `charges`)
* **File Path**: [`shared\charge.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/shared\charge.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `amount` | `Number` | Required | - |
| `description` | `String` | - | - |
| `name` | `String` | Required, Unique | - |
| `type` | `String` | Required | Enum: [`"FIXED"`, `"PERCENTAGE"`] |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## SHARED\CONFIG.MODEL.JS

### `Config` (Collection: `config`)
* **File Path**: [`shared\config.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/shared\config.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `key` | `String` | Required, Unique | - |
| `value` | `Mixed` | Required | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## SHARED\COUNTER.MODEL.JS

### `Counter` (Collection: `counters`)
* **File Path**: [`shared\counter.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/shared\counter.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `String` | Required | - |
| `seq` | `Number` | - | Default: `0` |

---

## SHARED\SUPPLIER.MODEL.JS

### `Supplier` (Collection: `suppliers`)
* **File Path**: [`shared\supplier.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/shared\supplier.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `address` | `String` | - | - |
| `contactPerson` | `String` | - | - |
| `email` | `String` | - | - |
| `name` | `String` | Required, Unique | - |
| `phone` | `String` | - | - |
| `status` | `String` | - | Enum: [`"active"`, `"inactive"`] | Default: `"active"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## SHARED\USER.MODEL.JS

### `User` (Collection: `users`)
* **File Path**: [`shared\user.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/shared\user.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `additionalEmails` | `Array` | - | - |
| `address` | `String` | - | Default: `""` |
| `authMethods` | `Array<String>` | - | Enum: [`"email"`, `"phone"`] | Default: `["email"]` |
| `email` | `String` | Unique, Sparse | - |
| `emailOtp` | `String` | - | - |
| `emailOtpExpires` | `Date` | - | - |
| `emailVerified` | `Boolean` | - | Default: `false` |
| `fullName` | `String` | Required | - |
| `gender` | `String` | - | Enum: [`"Male"`, `"Female"`, `"Other"`, `""`] | Default: `""` |
| `lastName` | `String` | - | Default: `""` |
| `lockUntil` | `Date` | - | - |
| `loginAttempts` | `Number` | - | Default: `0` |
| `passwordHash` | `String` | Required | - |
| `phoneNumber` | `String` | Unique, Sparse | - |
| `phoneOtp` | `String` | - | - |
| `phoneOtpExpires` | `Date` | - | - |
| `phoneVerified` | `Boolean` | - | Default: `false` |
| `profilePhoto` | `String` | - | Default: `""` |
| `resetPasswordExpires` | `Date` | - | - |
| `resetPasswordToken` | `String` | - | - |
| `role` | `String` | - | Enum: [`"SUPER_ADMIN"`, `"CUSTOMER"`, `"CSA"`, `"INSPECTION"`, `"MAIN_TECH"`, `"SERVICE_TEAM"`, `"FINANCE"`, `"INVENTORY"`, `"MANAGER"`] | Default: `"CUSTOMER"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\ACTIVITY.MODEL.JS

### `Activity` (Collection: `activities`)
* **File Path**: [`warehouse\activity.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\activity.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `actionLabel` | `String` | - | - |
| `actionUrl` | `String` | - | - |
| `description` | `String` | - | - |
| `timestamp` | `Date` | - | Default: `"[Function]"` |
| `title` | `String` | Required | - |
| `type` | `String` | Required | Enum: [`"return"`, `"dispatch"`, `"request"`, `"grn"`, `"alert"`] |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\ASSETLOAN.MODEL.JS

### `AssetLoan` (Collection: `asset_loans`)
* **File Path**: [`warehouse\assetLoan.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\assetLoan.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `assetTag` | `String` | Required, Unique | - |
| `checkedOutAt` | `Date` | - | Default: `"[Function]"` |
| `condition` | `String` | - | Enum: [`"good"`, `"damaged"`, `"lost"`] |
| `dueDate` | `Date` | Required | - |
| `returnedAt` | `Date` | - | - |
| `status` | `String` | - | Enum: [`"on-loan"`, `"returned"`] | Default: `"on-loan"` |
| `technicianId` | `String` | Required | - |
| `technicianName` | `String` | Required | - |
| `technicianUserId` | `ObjectId` | - | References `User` |
| `toolId` | `ObjectId` | - | References `Inventory` |
| `toolName` | `String` | Required | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\DISPATCHORDER.MODEL.JS

### `DispatchOrder` (Collection: `dispatch_orders`)
* **File Path**: [`warehouse\dispatchOrder.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\dispatchOrder.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `completedAt` | `String` | - | - |
| `courier` | `String` | - | - |
| `customer` | `String` | Required | - |
| `date` | `String` | Required | - |
| `items` | `Array` | - | - |
| `lastMovedAt` | `Date` | - | - |
| `orderId` | `String` | Required, Unique | - |
| `sourceOrderId` | `ObjectId` | - | - |
| `sourceOrderType` | `String` | - | Enum: [`"Order"`, `"InstallationOrder"`] |
| `status` | `String` | - | Enum: [`"to-pack"`, `"ready"`, `"in-transit"`, `"completed"`] | Default: `"to-pack"` |
| `trackId` | `String` | - | - |
| `type` | `String` | Required | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\INVENTORY.MODEL.JS

### `Inventory` (Collection: `inventory`)
* **File Path**: [`warehouse\inventory.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\inventory.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `available` | `Number` | - | Default: `0` |
| `binLocation` | `String` | - | Default: `""` |
| `brand` | `String` | Required | - |
| `capacityBtu` | `Number` | - | - |
| `category` | `String` | Required | - |
| `compatibleModels` | `Array<Mixed>` | - | - |
| `isSerialized` | `Boolean` | - | Default: `false` |
| `itemClass` | `String` | - | Enum: [`"AC Equipment"`, `"Spare Parts"`, `"Installation Materials"`, `"Consumables"`, `"Tools and Test Equipment"`, `"Kits and Bundles"`, `"Unclassified"`] | Default: `"Unclassified"` |
| `location` | `String` | - | Default: `"Warehouse"` |
| `manufacturerPartNumber` | `String` | - | Default: `""` |
| `maxStockLevel` | `Number` | - | Default: `100` |
| `name` | `String` | Required | - |
| `phase` | `String` | - | Enum: [`"Single Phase"`, `"Three Phase"`, `"Not Applicable"`] | Default: `"Not Applicable"` |
| `pricing.costPerUnit` | `Number` | - | - |
| `pricing.profitMargin` | `Number` | - | Default: `0.25` |
| `pricing.sellingPricePerUnit` | `Number` | - | - |
| `refrigerants` | `Array<Mixed>` | - | - |
| `reorderLevel` | `Number` | - | Default: `10` |
| `reserved` | `Number` | - | Default: `0` |
| `serialNumbers` | `Array<Mixed>` | - | - |
| `sku` | `String` | Required, Unique | - |
| `specsUrl` | `String` | - | - |
| `status` | `String` | - | Enum: [`"critical"`, `"warning"`, `"normal"`] | Default: `"normal"` |
| `subcategory` | `String` | - | Default: `"Unclassified"` |
| `supplierId` | `ObjectId` | - | References `Supplier` |
| `systemType` | `String` | - | Enum: [`"Split"`, `"Cassette"`, `"Ducted"`, `"Multi-Split"`, `"VRF/VRV"`, `"Packaged/Rooftop"`, `"AHU/FCU"`, `"Universal"`, `"Not Applicable"`] | Default: `"Not Applicable"` |
| `type` | `String` | - | Enum: [`"Single"`, `"Kit"`, `"Bundle"`] | Default: `"Single"` |
| `unit` | `String` | - | Default: `"units"` |
| `unitCost` | `Number` | - | Default: `0` |
| `voltage` | `String` | - | Default: `""` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\LEFTOVERRETURN.MODEL.JS

### `LeftoverReturn` (Collection: `leftover_returns`)
* **File Path**: [`warehouse\leftoverReturn.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\leftoverReturn.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `condition` | `String` | Required | Enum: [`"good"`, `"damaged"`, `"scrap"`] |
| `itemId` | `ObjectId` | - | References `Inventory` |
| `itemName` | `String` | Required | - |
| `itemSku` | `String` | - | - |
| `jobId` | `String` | Required | - |
| `movedToQuarantine` | `Boolean` | - | Default: `false` |
| `notes` | `String` | - | Default: `""` |
| `quantityReturned` | `Number` | Required | - |
| `restoredToStock` | `Boolean` | - | Default: `false` |
| `returnedBy` | `String` | Required | - |
| `returnId` | `String` | Required, Unique | - |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\PROCUREMENT.MODEL.JS

### `Procurement` (Collection: `procurements`)
* **File Path**: [`warehouse\procurement.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\procurement.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `affectedWorkReference` | `String` | - | Default: `""` |
| `binLocation` | `String` | - | Default: `""` |
| `brand` | `String` | - | Default: `""` |
| `condition` | `String` | - | Enum: [`"Good"`, `"Damaged"`, `"Incomplete"`] | Default: `"Good"` |
| `inventoryId` | `ObjectId` | - | References `Inventory` |
| `invoiceNumber` | `String` | - | Default: `""` |
| `itemClass` | `String` | - | Default: `"Unclassified"` |
| `itemName` | `String` | Required | - |
| `nonPoReason` | `String` | - | Enum: [`""`, `"EMERGENCY_REPAIR"`, `"LOCAL_PURCHASE"`, `"WARRANTY_REPLACEMENT"`, `"SUPPLIER_REPLACEMENT"`, `"OTHER"`] | Default: `""` |
| `orderLineId` | `String` | - | Default: `""` |
| `orderRequestId` | `ObjectId` | - | References `PurchaseRequest` |
| `poNumber` | `String` | - | - |
| `quantity` | `Number` | Required | - |
| `receiptAuthorizationId` | `ObjectId` | - | References `ReceiptAuthorization` |
| `receiptEventId` | `String` | Unique, Sparse | - |
| `receiptMode` | `String` | - | Enum: [`"PO"`, `"NON_PO"`, `"LEGACY"`] | Default: `"LEGACY"` |
| `receivedBy` | `String` | Required | - |
| `receivedDate` | `Date` | - | Default: `"[Function]"` |
| `sku` | `String` | Required | - |
| `sourceDocumentKey` | `String` | - | Default: `""` |
| `sourceDocumentNumber` | `String` | - | Default: `""` |
| `subcategory` | `String` | - | Default: `"Unclassified"` |
| `supplierId` | `ObjectId` | - | References `Supplier` |
| `supplierName` | `String` | Required | - |
| `supportingDocumentUrl` | `String` | - | Default: `""` |
| `timestamp` | `Date` | - | Default: `"[Function]"` |
| `totalCost` | `Number` | - | Default: `0` |
| `unit` | `String` | Required | - |
| `unitCost` | `Number` | - | Default: `0` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\PURCHASEREQUEST.MODEL.JS

### `PurchaseRequest` (Collection: `purchase_requests`)
* **File Path**: [`warehouse\purchaseRequest.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\purchaseRequest.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `approvedAt` | `Date` | - | - |
| `approvedBy` | `String` | - | Default: `""` |
| `decisionHistory` | `Array` | - | - |
| `financialApproval` | `Embedded` | - | - |
| `items` | `Array` | - | - |
| `notes` | `String` | - | Default: `""` |
| `operationalApproval` | `Embedded` | - | - |
| `orderedAt` | `Date` | - | - |
| `poNumber` | `String` | Unique, Sparse | - |
| `priority` | `String` | - | Enum: [`"normal"`, `"urgent"`] | Default: `"normal"` |
| `rejectedAt` | `Date` | - | - |
| `rejectionReason` | `String` | - | Default: `""` |
| `requestedBy` | `String` | Required | - |
| `requestedById` | `ObjectId` | - | References `User` |
| `requestId` | `String` | Required, Unique | - |
| `source` | `String` | - | Enum: [`"manual"`, `"low-stock"`] | Default: `"manual"` |
| `status` | `String` | - | Enum: [`"draft"`, `"pending-manager"`, `"pending-finance"`, `"approved"`, `"rejected"`, `"ordered"`, `"partially-received"`, `"received"`, `"cancelled"`, `"pending-approval"`] | Default: `"draft"` |
| `statusVersion` | `Number` | - | Default: `0` |
| `supplierId` | `ObjectId` | - | References `Supplier` |
| `supplierName` | `String` | Required | - |
| `totalEstimate` | `Number` | - | Default: `0` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\QUARANTINEITEM.MODEL.JS

### `QuarantineItem` (Collection: `quarantine_items`)
* **File Path**: [`warehouse\quarantineItem.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\quarantineItem.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `disposedAt` | `Date` | - | - |
| `disposedBy` | `String` | - | - |
| `itemName` | `String` | Required | - |
| `location` | `String` | - | Default: `""` |
| `quantity` | `Number` | Required | - |
| `quarantineId` | `String` | Required, Unique | - |
| `reason` | `String` | Required | - |
| `source` | `String` | - | Enum: [`"leftover-return"`, `"rma"`, `"manual"`] | Default: `"manual"` |
| `sourceRefId` | `String` | - | Default: `""` |
| `status` | `String` | - | Enum: [`"quarantined"`, `"disposed"`, `"returned-to-supplier"`] | Default: `"quarantined"` |
| `unit` | `String` | - | Default: `"units"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\RECEIPTAUTHORIZATION.MODEL.JS

### `ReceiptAuthorization` (Collection: `receipt_authorizations`)
* **File Path**: [`warehouse\receiptAuthorization.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\receiptAuthorization.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `affectedWorkId` | `String` | - | Default: `""` |
| `affectedWorkReference` | `String` | - | Default: `""` |
| `affectedWorkType` | `String` | - | Enum: [`"REPAIR"`, `"INSTALLATION"`, `"MAINTENANCE"`, `"INSPECTION"`, `"TICKET"`, `"OTHER"`, `"NONE"`] | Default: `"NONE"` |
| `approvalComment` | `String` | - | Default: `""` |
| `approvedAt` | `Date` | - | - |
| `approvedById` | `ObjectId` | - | References `User` |
| `approvedByName` | `String` | - | Default: `""` |
| `authorizationNumber` | `String` | Required, Unique | - |
| `authorizedQuantity` | `Number` | Required | - |
| `estimatedTotal` | `Number` | - | Default: `0` |
| `explanation` | `String` | Required | - |
| `financeComment` | `String` | - | Default: `""` |
| `financeReference` | `String` | - | Default: `""` |
| `financeReviewedAt` | `Date` | - | - |
| `financeReviewedById` | `ObjectId` | - | References `User` |
| `financeReviewStatus` | `String` | - | Enum: [`"not-required"`, `"pending"`, `"reconciled"`, `"rejected"`] | Default: `"pending"` |
| `inventoryId` | `ObjectId` | - | References `Inventory` |
| `newItemSnapshot` | `Mixed` | - | - |
| `nonPoReason` | `String` | Required | Enum: [`"EMERGENCY_REPAIR"`, `"LOCAL_PURCHASE"`, `"WARRANTY_REPLACEMENT"`, `"SUPPLIER_REPLACEMENT"`, `"OTHER"`] |
| `receiptMode` | `String` | - | Enum: [`"NON_PO"`] | Default: `"NON_PO"` |
| `receivedQuantity` | `Number` | - | Default: `0` |
| `rejectedAt` | `Date` | - | - |
| `rejectionReason` | `String` | - | Default: `""` |
| `requestedById` | `ObjectId` | Required | References `User` |
| `requestedByName` | `String` | Required | - |
| `sourceDocumentNumber` | `String` | Required | - |
| `status` | `String` | - | Enum: [`"pending"`, `"approved"`, `"rejected"`, `"partially-received"`, `"completed"`] | Default: `"pending"` |
| `statusVersion` | `Number` | - | Default: `0` |
| `supplierId` | `ObjectId` | Required | References `Supplier` |
| `supplierName` | `String` | Required | - |
| `supportingDocumentUrl` | `String` | - | Default: `""` |
| `unitCost` | `Number` | - | Default: `0` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\RMACASE.MODEL.JS

### `RmaCase` (Collection: `rma_cases`)
* **File Path**: [`warehouse\rmaCase.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\rmaCase.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `faultDescription` | `String` | Required | - |
| `inventoryId` | `ObjectId` | - | References `Inventory` |
| `itemName` | `String` | - | - |
| `itemSku` | `String` | - | - |
| `reportedBy` | `String` | Required | - |
| `resolution` | `String` | - | - |
| `resolvedAt` | `Date` | - | - |
| `rmaId` | `String` | Required, Unique | - |
| `serialNumber` | `String` | Required | - |
| `status` | `String` | - | Enum: [`"reported"`, `"under-review"`, `"sent-to-supplier"`, `"resolved"`, `"closed"`] | Default: `"reported"` |
| `type` | `String` | - | Enum: [`"Single"`, `"Kit"`, `"Bundle"`] | Default: `"Single"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

## WAREHOUSE\WAREHOUSEPICKREQUEST.MODEL.JS

### `WarehousePickRequest` (Collection: `warehouse_pick_requests`)
* **File Path**: [`warehouse\warehousePickRequest.model.js`](file:///c:/Users/dashi/Downloads/New%20folder/models/warehouse\warehousePickRequest.model.js)

| Field | Type | Attributes / Constraints | Details |
|---|---|---|---|
| `_id` | `ObjectId` | - | - |
| `completedAt` | `String` | - | - |
| `date` | `String` | Required | - |
| `items` | `Array` | - | - |
| `lastMovedAt` | `Date` | - | - |
| `location` | `String` | Required | - |
| `requester` | `String` | Required | - |
| `requestId` | `String` | Required, Unique | - |
| `serviceTeam` | `String` | - | - |
| `status` | `String` | - | Enum: [`"pending"`, `"reserved"`, `"completed"`] | Default: `"pending"` |
| `createdAt` | `Date` | - | - |
| `updatedAt` | `Date` | - | - |

---

