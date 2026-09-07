# MongoDB Schema Report

**Database:** `airlux`  
**Generated:** 2026-08-22T07:38:05.252Z

## Collection: `tech_team_members`

- Total documents: 2
- Documents scanned: 2

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ff09ec22a4f0089f1" |
| `contactNumber` | string | 100% | "+94770000003" |
| `createdAt` | date | 100% | "2026-08-20T08:10:55.805Z" |
| `name` | string | 100% | "Kasun Silva" |
| `role` | string | 100% | "Lead" |
| `teamId` | objectId | 100% | "6a86b68ff09ec22a4f0089ef" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:55.805Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `inspectiontickets`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `configs`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}
- `key_1` on {"key":1} (unique)

---

## Collection: `audit_logs`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `warehouse_pick_requests`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b693f09ec22a4f008a23" |
| `createdAt` | date | 100% | "2026-08-20T08:10:59.590Z" |
| `date` | string | 100% | "2026-08-20" |
| `items` | array | 100% | "[1 item(s)]" |
| `items[].confirmed` | boolean | 100% | false |
| `items[].name` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `items[].qty` | int | 100% | 5 |
| `items[].sku` | string | 100% | "PIPE-CU-025" |
| `location` | string | 100% | "Colombo" |
| `requester` | string | 100% | "Kasun Silva" |
| `requestId` | string | 100% | "PRQ-0001" |
| `status` | string | 100% | "pending" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:59.590Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `requestId_1` on {"requestId":1} (unique)

---

## Collection: `inquiries`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}
- `inquiryRef_1` on {"inquiryRef":1} (unique)

---

## Collection: `purchase_requests`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ff09ec22a4f0089ec" |
| `approvedBy` | string | 100% | "" |
| `createdAt` | date | 100% | "2026-08-20T08:10:55.499Z" |
| `decisionHistory` | array | 100% | "[0 item(s)]" |
| `items` | array | 100% | "[1 item(s)]" |
| `items[].estimatedTotal` | int | 100% | 170000 |
| `items[].inventoryId` | objectId | 100% | "6a86b68ff09ec22a4f0089ea" |
| `items[].itemClass` | string | 100% | "Unclassified" |
| `items[].lineId` | string | 100% | "6a86b68ff09ec22a4f0089ed" |
| `items[].manufacturerPartNumber` | string | 100% | "" |
| `items[].name` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `items[].quantity` | int | 100% | 200 |
| `items[].receivedQuantity` | int | 100% | 0 |
| `items[].sku` | string | 100% | "PIPE-CU-025" |
| `items[].subcategory` | string | 100% | "Unclassified" |
| `items[].supplierId` | objectId | 100% | "6a86b68ef09ec22a4f0089dc" |
| `items[].unit` | string | 100% | "meters" |
| `items[].unitCost` | int | 100% | 850 |
| `notes` | string | 100% | "" |
| `priority` | string | 100% | "normal" |
| `rejectionReason` | string | 100% | "" |
| `requestedBy` | string | 100% | "Kasun Silva" |
| `requestedById` | objectId | 100% | "6a86b68df09ec22a4f0089ca" |
| `requestId` | string | 100% | "PR-0001" |
| `source` | string | 100% | "manual" |
| `status` | string | 100% | "pending-manager" |
| `statusVersion` | int | 100% | 0 |
| `supplierId` | objectId | 100% | "6a86b68ef09ec22a4f0089dc" |
| `supplierName` | string | 100% | "ColdChain Distributors (Pvt) Ltd" |
| `totalEstimate` | int | 100% | 170000 |
| `updatedAt` | date | 100% | "2026-08-20T08:10:55.499Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `requestId_1` on {"requestId":1} (unique)
- `poNumber_1` on {"poNumber":1} (unique)

---

## Collection: `rma_cases`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b693f09ec22a4f008a21" |
| `createdAt` | date | 100% | "2026-08-20T08:10:59.435Z" |
| `faultDescription` | string | 100% | "Leak detected in joint" |
| `inventoryId` | objectId | 100% | "6a86b68ff09ec22a4f0089ea" |
| `itemName` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `itemSku` | string | 100% | "PIPE-CU-025" |
| `reportedBy` | string | 100% | "Kasun Silva" |
| `rmaId` | string | 100% | "RMA-0001" |
| `serialNumber` | string | 100% | "SN-987654321" |
| `status` | string | 100% | "reported" |
| `type` | string | 100% | "Single" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:59.435Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `rmaId_1` on {"rmaId":1} (unique)

---

## Collection: `tech_teams`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ff09ec22a4f0089ef" |
| `createdAt` | date | 100% | "2026-08-20T08:10:55.646Z" |
| `specialization` | string | 100% | "Installations" |
| `status` | string | 100% | "Available" |
| `teamName` | string | 100% | "Colombo Installation Team A" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:55.646Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `inspection_reports`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b690f09ec22a4f008a00" |
| `contactNumber` | string | 100% | "+94770000002" |
| `createdAt` | date | 100% | "2026-08-20T08:10:56.662Z" |
| `customerName` | string | 100% | "Nadeesha Fernando" |
| `elevatorAvailability` | boolean | 100% | true |
| `floorLevel` | string | 100% | "Ground Floor" |
| `inspectionDate` | string | 100% | "2026-08-20" |
| `inspectorId` | objectId | 100% | "6a86b68df09ec22a4f0089d0" |
| `inspectorName` | string | 100% | "Dilshan Silva" |
| `orderId` | objectId | 100% | "6a86b68ff09ec22a4f0089e8" |
| `parkingAvailability` | string | 100% | "Available" |
| `photos` | array | 100% | "[0 item(s)]" |
| `rooms` | array | 100% | "[0 item(s)]" |
| `siteAddress` | string | 100% | "45 Negombo Road, Negombo" |
| `siteStatus` | string | 100% | "Ready" |
| `siteType` | string | 100% | "Residential" |
| `status` | string | 100% | "SUBMITTED" |
| `submittedAt` | date | 100% | "2026-08-20T08:10:56.659Z" |
| `ticketId` | objectId | 100% | "6a86b68ff09ec22a4f0089f5" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:56.662Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `maintenances`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b690f09ec22a4f008a05" |
| `createdAt` | date | 100% | "2026-08-20T08:10:57.003Z" |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `date` | date | 100% | "2026-08-20T08:10:56.999Z" |
| `isUnderWarranty` | boolean | 100% | true |
| `maintenanceType` | string | 100% | "Customer Initiated" |
| `materialList` | array | 100% | "[1 item(s)]" |
| `materialList[]._id` | objectId | 100% | "6a86b691f09ec22a4f008a06" |
| `materialList[].estimatedCost` | int | 100% | 1700 |
| `materialList[].item` | string | 100% | "Copper Piping 1/4\"" |
| `materialList[].quantity` | int | 100% | 2 |
| `serviceReport` | object | 100% | "{...}" |
| `serviceReport.photos` | array | 100% | "[0 item(s)]" |
| `status` | string | 100% | "New" |
| `ticketId` | string | 100% | "MS-0001-ACT" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:57.003Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `ticketId_1` on {"ticketId":1} (unique)

---

## Collection: `cartscenarios`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `inventory`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ff09ec22a4f0089ea" |
| `available` | int | 100% | 500 |
| `binLocation` | string | 100% | "" |
| `brand` | string | 100% | "Generic" |
| `category` | string | 100% | "Piping" |
| `compatibleModels` | array | 100% | "[0 item(s)]" |
| `createdAt` | date | 100% | "2026-08-20T08:10:55.359Z" |
| `isSerialized` | boolean | 100% | false |
| `itemClass` | string | 100% | "Installation Materials" |
| `location` | string | 100% | "Warehouse" |
| `manufacturerPartNumber` | string | 100% | "" |
| `maxStockLevel` | int | 100% | 100 |
| `name` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `phase` | string | 100% | "Not Applicable" |
| `pricing` | object | 100% | "{...}" |
| `pricing.costPerUnit` | int | 100% | 850 |
| `pricing.profitMargin` | double | 100% | 0.25 |
| `pricing.sellingPricePerUnit` | double | 100% | 1062.5 |
| `refrigerants` | array | 100% | "[0 item(s)]" |
| `reorderLevel` | int | 100% | 100 |
| `reserved` | int | 100% | 20 |
| `serialNumbers` | array | 100% | "[0 item(s)]" |
| `sku` | string | 100% | "PIPE-CU-025" |
| `status` | string | 100% | "normal" |
| `subcategory` | string | 100% | "Unclassified" |
| `supplierId` | objectId | 100% | "6a86b68ef09ec22a4f0089dc" |
| `systemType` | string | 100% | "Not Applicable" |
| `type` | string | 100% | "Single" |
| `unit` | string | 100% | "meters" |
| `unitCost` | int | 100% | 850 |
| `updatedAt` | date | 100% | "2026-08-20T08:10:55.359Z" |
| `voltage` | string | 100% | "" |

**Indexes:**

- `_id_` on {"_id":1}
- `sku_1` on {"sku":1} (unique)

---

## Collection: `asset_loans`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b692f09ec22a4f008a15" |
| `assetTag` | string | 100% | "ASSET-0001" |
| `checkedOutAt` | date | 100% | "2026-08-20T08:10:58.394Z" |
| `createdAt` | date | 100% | "2026-08-20T08:10:58.396Z" |
| `dueDate` | date | 100% | "2026-08-27T08:10:58.394Z" |
| `status` | string | 100% | "on-loan" |
| `technicianId` | string | 100% | "TECH-01" |
| `technicianName` | string | 100% | "Kasun Silva" |
| `technicianUserId` | objectId | 100% | "6a86b68df09ec22a4f0089ca" |
| `toolId` | objectId | 100% | "6a86b68ff09ec22a4f0089ea" |
| `toolName` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:58.396Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `assetTag_1` on {"assetTag":1} (unique)

---

## Collection: `products`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ef09ec22a4f0089e2" |
| `averageRating` | int | 100% | 0 |
| `brand` | string | 100% | "Airlux" |
| `capacity` | int | 100% | 12000 |
| `category` | string | 100% | "Split AC" |
| `createdAt` | date | 100% | "2026-08-20T08:10:54.828Z" |
| `description` | string | 100% | "Inverter split-type air conditioner, ene..." |
| `features` | array | 100% | "[3 item(s)]" |
| `image` | string | 100% | "https://example.com/images/splitcool-120..." |
| `images` | array | 100% | "[0 item(s)]" |
| `inStock` | boolean | 100% | true |
| `name` | string | 100% | "Airlux SplitCool 12000BTU" |
| `price` | int | 100% | 145000 |
| `reviewCount` | int | 100% | 0 |
| `reviews` | array | 100% | "[0 item(s)]" |
| `specs` | array | 100% | "[2 item(s)]" |
| `specs[].key` | string | 100% | "Energy Rating" |
| `specs[].value` | string | 100% | "5 Star" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:54.828Z" |
| `variants` | array | 100% | "[3 item(s)]" |
| `variants[].capacity` | int | 100% | 9000 |
| `variants[].label` | string | 100% | "9000 BTU" |
| `variants[].price` | int | 100% | 120000 |
| `warrantyInfo` | object | 100% | "{...}" |
| `warrantyInfo.comprehensive` | string | 100% | "1 year" |
| `warrantyInfo.compressor` | string | 100% | "5 years" |
| `warrantyInfo.covered` | array | 100% | "[2 item(s)]" |
| `warrantyInfo.notCovered` | array | 100% | "[2 item(s)]" |

**Indexes:**

- `_id_` on {"_id":1}
- `brand_1` on {"brand":1}
- `category_1` on {"category":1}
- `capacity_1` on {"capacity":1}
- `price_1` on {"price":1}
- `createdAt_-1` on {"createdAt":-1}

---

## Collection: `dispatch_orders`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b692f09ec22a4f008a17" |
| `createdAt` | date | 100% | "2026-08-20T08:10:58.568Z" |
| `customer` | string | 100% | "Nadeesha Fernando" |
| `date` | string | 100% | "2026-08-20" |
| `items` | array | 100% | "[1 item(s)]" |
| `items[].confirmed` | boolean | 100% | false |
| `items[].name` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `items[].qty` | int | 100% | 10 |
| `items[].sku` | string | 100% | "PIPE-CU-025" |
| `orderId` | string | 100% | "DO-0001" |
| `sourceOrderId` | objectId | 100% | "6a86b68ff09ec22a4f0089e6" |
| `sourceOrderType` | string | 100% | "Order" |
| `status` | string | 100% | "to-pack" |
| `type` | string | 100% | "Delivery" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:58.568Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `orderId_1` on {"orderId":1} (unique)

---

## Collection: `maintenance_schedules`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b691f09ec22a4f008a08" |
| `createdAt` | date | 100% | "2026-08-20T08:10:57.172Z" |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `installationId` | objectId | 100% | "6a86b690f09ec22a4f0089f7" |
| `services` | array | 100% | "[1 item(s)]" |
| `services[]._id` | objectId | 100% | "6a86b691f09ec22a4f008a09" |
| `services[].date` | date | 100% | "2026-11-18T08:10:57.169Z" |
| `services[].serviceName` | string | 100% | "1st Free Service" |
| `status` | string | 100% | "Sent to Customer" |
| `ticketId` | string | 100% | "SCH-0001" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:57.172Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `ticketId_1` on {"ticketId":1} (unique)

---

## Collection: `procurements`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b692f09ec22a4f008a1b" |
| `affectedWorkReference` | string | 100% | "" |
| `binLocation` | string | 100% | "" |
| `brand` | string | 100% | "" |
| `condition` | string | 100% | "Good" |
| `createdAt` | date | 100% | "2026-08-20T08:10:58.915Z" |
| `inventoryId` | objectId | 100% | "6a86b68ff09ec22a4f0089ea" |
| `invoiceNumber` | string | 100% | "" |
| `itemClass` | string | 100% | "Unclassified" |
| `itemName` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `nonPoReason` | string | 100% | "" |
| `orderLineId` | string | 100% | "" |
| `quantity` | int | 100% | 100 |
| `receiptMode` | string | 100% | "LEGACY" |
| `receivedBy` | string | 100% | "Ishara Jayasuriya" |
| `receivedDate` | date | 100% | "2026-08-20T08:10:58.914Z" |
| `sku` | string | 100% | "PIPE-CU-025" |
| `sourceDocumentKey` | string | 100% | "" |
| `sourceDocumentNumber` | string | 100% | "" |
| `subcategory` | string | 100% | "Unclassified" |
| `supplierId` | objectId | 100% | "6a86b68ef09ec22a4f0089dc" |
| `supplierName` | string | 100% | "ColdChain Distributors (Pvt) Ltd" |
| `supportingDocumentUrl` | string | 100% | "" |
| `timestamp` | date | 100% | "2026-08-20T08:10:58.914Z" |
| `totalCost` | int | 100% | 85000 |
| `unit` | string | 100% | "meters" |
| `unitCost` | int | 100% | 850 |
| `updatedAt` | date | 100% | "2026-08-20T08:10:58.915Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `sourceDocumentKey_1` on {"sourceDocumentKey":1}
- `receiptEventId_1` on {"receiptEventId":1} (unique)

---

## Collection: `config`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ef09ec22a4f0089da" |
| `createdAt` | date | 100% | "2026-08-20T08:10:54.302Z" |
| `key` | string | 100% | "company_contact" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:54.302Z" |
| `value` | object | 100% | "{...}" |
| `value.email` | string | 100% | "info@airlux.lk" |
| `value.phone` | string | 100% | "+94112345678" |

**Indexes:**

- `_id_` on {"_id":1}
- `key_1` on {"key":1} (unique)

---

## Collection: `installations`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b690f09ec22a4f0089f7" |
| `assignedTeamId` | objectId | 100% | "6a86b68ff09ec22a4f0089ef" |
| `assignedTeamName` | string | 100% | "Colombo Installation Team A" |
| `createdAt` | date | 100% | "2026-08-20T08:10:56.159Z" |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `inspectionTicketId` | objectId | 100% | "6a86b68ff09ec22a4f0089f5" |
| `location` | string | 100% | "45 Negombo Road, Negombo" |
| `materials` | array | 100% | "[1 item(s)]" |
| `materials[]._id` | objectId | 100% | "6a86b690f09ec22a4f0089f8" |
| `materials[].item` | string | 100% | "Copper Piping 1/4\"" |
| `materials[].quantity` | int | 100% | 6 |
| `orderId` | objectId | 100% | "6a86b68ff09ec22a4f0089e8" |
| `productType` | string | 100% | "Split AC" |
| `serviceDate` | date | 100% | "2026-08-27T08:10:56.157Z" |
| `siteDetails` | object | 100% | "{...}" |
| `siteDetails.buildingType` | string | 100% | "Residential" |
| `siteDetails.ceilingHeight` | string | 100% | "9ft" |
| `siteDetails.floors` | int | 100% | 2 |
| `siteDetails.outdoorAccess` | boolean | 100% | true |
| `siteDetails.powerSupply` | string | 100% | "Single Phase" |
| `siteDetails.rooms` | int | 100% | 4 |
| `siteDetails.wallType` | string | 100% | "Brick" |
| `status` | string | 100% | "Assigned" |
| `units` | int | 100% | 1 |
| `updatedAt` | date | 100% | "2026-08-20T08:10:56.159Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `service_tickets`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b690f09ec22a4f0089fa" |
| `assignedTechnicianId` | objectId | 100% | "6a86b68df09ec22a4f0089ca" |
| `category` | string | 100% | "maintenance" |
| `createdAt` | date | 100% | "2026-08-20T08:10:56.331Z" |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `description` | string | 100% | "Customer requested first free service af..." |
| `priority` | string | 100% | "medium" |
| `requestType` | string | 100% | "Maintenance" |
| `serviceFee` | int | 100% | 0 |
| `slaDueAt` | date | 100% | "2026-09-03T08:10:56.328Z" |
| `status` | string | 100% | "Assigned" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:56.331Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `bank_details`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ef09ec22a4f0089de" |
| `accountName` | string | 100% | "Airlux Engineering (Pvt) Ltd" |
| `accountNumber` | string | 100% | "8001234567" |
| `bankName` | string | 100% | "Commercial Bank" |
| `branch` | string | 100% | "Negombo" |
| `createdAt` | date | 100% | "2026-08-20T08:10:54.562Z" |
| `currency` | string | 100% | "LKR" |
| `type` | string | 100% | "Current" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:54.562Z" |
| `updatedBy` | objectId | 100% | "6a86b68cf09ec22a4f0089c6" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `receipt_authorizations`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b693f09ec22a4f008a1f" |
| `affectedWorkId` | string | 100% | "" |
| `affectedWorkReference` | string | 100% | "" |
| `affectedWorkType` | string | 100% | "NONE" |
| `approvalComment` | string | 100% | "" |
| `approvedByName` | string | 100% | "" |
| `authorizationNumber` | string | 100% | "RA-0001" |
| `authorizedQuantity` | int | 100% | 50 |
| `createdAt` | date | 100% | "2026-08-20T08:10:59.265Z" |
| `estimatedTotal` | int | 100% | 0 |
| `explanation` | string | 100% | "Emergency purchase of copper piping due ..." |
| `financeComment` | string | 100% | "" |
| `financeReference` | string | 100% | "" |
| `financeReviewStatus` | string | 100% | "pending" |
| `inventoryId` | objectId | 100% | "6a86b68ff09ec22a4f0089ea" |
| `nonPoReason` | string | 100% | "LOCAL_PURCHASE" |
| `receiptMode` | string | 100% | "NON_PO" |
| `receivedQuantity` | int | 100% | 0 |
| `rejectionReason` | string | 100% | "" |
| `requestedById` | objectId | 100% | "6a86b68df09ec22a4f0089ca" |
| `requestedByName` | string | 100% | "Kasun Silva" |
| `sourceDocumentNumber` | string | 100% | "SDN-12345" |
| `status` | string | 100% | "pending" |
| `statusVersion` | int | 100% | 0 |
| `supplierId` | objectId | 100% | "6a86b68ef09ec22a4f0089dc" |
| `supplierName` | string | 100% | "ColdChain Distributors (Pvt) Ltd" |
| `supportingDocumentUrl` | string | 100% | "" |
| `unitCost` | int | 100% | 0 |
| `updatedAt` | date | 100% | "2026-08-20T08:10:59.265Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `authorizationNumber_1` on {"authorizationNumber":1} (unique)
- `supplierId_1_sourceDocumentNumber_1` on {"supplierId":1,"sourceDocumentNumber":1} (unique)

---

## Collection: `repairs`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b691f09ec22a4f008a0b" |
| `createdAt` | date | 100% | "2026-08-20T08:10:57.335Z" |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `location` | string | 100% | "45 Negombo Road, Negombo" |
| `materials` | array | 100% | "[1 item(s)]" |
| `materials[]._id` | objectId | 100% | "6a86b691f09ec22a4f008a0c" |
| `materials[].item` | string | 100% | "Copper Piping 1/4\"" |
| `materials[].quantity` | int | 100% | 1 |
| `notes` | string | 100% | "Leak fixed in joint." |
| `orderId` | objectId | 100% | "6a86b68ff09ec22a4f0089e6" |
| `repairType` | string | 100% | "minor" |
| `serviceTicketId` | objectId | 100% | "6a86b690f09ec22a4f0089fa" |
| `status` | string | 100% | "PENDING" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:57.335Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `service_reports`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b691f09ec22a4f008a0e" |
| `createdAt` | date | 100% | "2026-08-20T08:10:57.506Z" |
| `customer` | object | 100% | "{...}" |
| `customer.address` | string | 100% | "45 Negombo Road, Negombo" |
| `customer.email` | string | 100% | "nadeesha@example.com" |
| `customer.name` | string | 100% | "Nadeesha Fernando" |
| `customer.phone` | string | 100% | "+94770000002" |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `finalStatus` | string | 100% | "Completed" |
| `location` | string | 100% | "45 Negombo Road, Negombo" |
| `materialsUsed` | array | 100% | "[1 item(s)]" |
| `materialsUsed[]._id` | objectId | 100% | "6a86b691f09ec22a4f008a0f" |
| `materialsUsed[].item` | string | 100% | "Filter mesh" |
| `materialsUsed[].quantity` | int | 100% | 1 |
| `productDetails` | object | 100% | "{...}" |
| `productDetails.description` | string | 100% | "Regular cleaning service" |
| `productDetails.detailedType` | string | 100% | "Airlux SplitCool 12000BTU" |
| `productDetails.generalType` | string | 100% | "Split AC" |
| `repairType` | string | 100% | "MINOR" |
| `scheduledDate` | date | 100% | "2026-08-20T08:10:57.504Z" |
| `submittedAt` | date | 100% | "2026-08-20T08:10:57.504Z" |
| `technicianComment` | string | 100% | "Cleaned filters and indoor coils. Operat..." |
| `type` | string | 100% | "MAINTENANCE" |
| `units` | int | 100% | 1 |
| `updatedAt` | date | 100% | "2026-08-20T08:10:57.506Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `systemconfigs`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b77d1c304ac2d5969ec6" |
| `businessRules` | object | 100% | "{...}" |
| `businessRules.amcContractMonths` | int | 100% | 12 |
| `businessRules.defaultWarrantyMonths` | int | 100% | 24 |
| `businessRules.logRetentionDays` | int | 100% | 30 |
| `businessRules.maxRescheduleAttempts` | int | 100% | 3 |
| `businessRules.paymentAutoCancelDays` | int | 100% | 14 |
| `businessRules.quotationApprovalThreshold` | int | 100% | 1000000 |
| `createdAt` | date | 100% | "2026-08-20T08:14:53.883Z" |
| `featureFlags` | object | 100% | "{...}" |
| `featureFlags.amcModuleEnabled` | boolean | 100% | true |
| `featureFlags.customerFeedbackEnabled` | boolean | 100% | true |
| `featureFlags.deliveryTrackingEnabled` | boolean | 100% | true |
| `featureFlags.warrantyModuleEnabled` | boolean | 100% | true |
| `logging` | object | 100% | "{...}" |
| `logging.enableActivityLogs` | boolean | 100% | true |
| `logging.enableErrorLogs` | boolean | 100% | true |
| `logging.enableSecurityLogs` | boolean | 100% | true |
| `logging.logLevel` | string | 100% | "INFO" |
| `logging.logRetentionDays` | int | 100% | 30 |
| `maintenance` | object | 100% | "{...}" |
| `maintenance.endTime` | null | 100% | undefined |
| `maintenance.isActive` | boolean | 100% | false |
| `maintenance.message` | string | 100% | "System is under maintenance. Please try ..." |
| `maintenance.reason` | string | 100% | "" |
| `maintenance.scheduledEndTime` | null | 100% | undefined |
| `maintenance.scheduledStartEmailSentAt` | null | 100% | undefined |
| `maintenance.scheduledStartTime` | null | 100% | undefined |
| `maintenance.startTime` | null | 100% | undefined |
| `systemInfo` | object | 100% | "{...}" |
| `systemInfo.address` | string | 100% | "123 Galle Road, Colombo 03, Sri Lanka" |
| `systemInfo.supportEmail` | string | 100% | "support@airlux.lk" |
| `systemInfo.supportPhoneNumber` | string | 100% | "+94 11 234 5678" |
| `systemInfo.systemName` | string | 100% | "AirLux" |
| `updatedAt` | date | 100% | "2026-08-20T14:34:48.016Z" |
| `updatedBy` | objectId | 100% | "6a86b68cf09ec22a4f0089c6" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `installation_orders`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ff09ec22a4f0089e8" |
| `additionalCharges` | int | 100% | 5000 |
| `consultationCompleted` | boolean | 100% | false |
| `createdAt` | date | 100% | "2026-08-20T08:10:55.239Z" |
| `inspectionFee` | int | 100% | 5000 |
| `items` | array | 100% | "[1 item(s)]" |
| `items[].name` | string | 100% | "Airlux SplitCool 12000BTU" |
| `items[].price` | int | 100% | 145000 |
| `items[].productId` | string | 100% | "6a86b68ef09ec22a4f0089e2" |
| `items[].purchaseType` | string | 100% | "buy_and_install" |
| `items[].quantity` | int | 100% | 1 |
| `orderReference` | string | 100% | "ALX-BI-0001" |
| `shippingDetails` | object | 100% | "{...}" |
| `shippingDetails.address` | string | 100% | "45 Negombo Road" |
| `shippingDetails.city` | string | 100% | "Negombo" |
| `shippingDetails.email` | string | 100% | "nadeesha@example.com" |
| `shippingDetails.firstName` | string | 100% | "Nadeesha" |
| `shippingDetails.lastName` | string | 100% | "Fernando" |
| `shippingDetails.phone` | string | 100% | "+94770000002" |
| `shippingDetails.postalCode` | string | 100% | "11500" |
| `status` | string | 100% | "Awaiting Inspection" |
| `subtotal` | int | 100% | 145000 |
| `total` | int | 100% | 150000 |
| `updatedAt` | date | 100% | "2026-08-20T08:10:55.239Z" |
| `userId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |

**Indexes:**

- `_id_` on {"_id":1}
- `orderReference_1` on {"orderReference":1} (unique)

---

## Collection: `activities`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b691f09ec22a4f008a13" |
| `actionLabel` | string | 100% | "View Dispatch Order" |
| `actionUrl` | string | 100% | "/warehouse/dispatch/DO-0001" |
| `createdAt` | date | 100% | "2026-08-20T08:10:57.846Z" |
| `description` | string | 100% | "Order ALX-BO-0001 has been dispatched vi..." |
| `timestamp` | date | 100% | "2026-08-20T08:10:57.845Z" |
| `title` | string | 100% | "Order Dispatched" |
| `type` | string | 100% | "dispatch" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:57.846Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `invoices`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b690f09ec22a4f0089fc" |
| `createdAt` | date | 100% | "2026-08-20T08:10:56.500Z" |
| `customerAddress` | string | 100% | "45 Negombo Road, Negombo" |
| `customerEmail` | string | 100% | "nadeesha@example.com" |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `customerName` | string | 100% | "Nadeesha Fernando" |
| `grandTotal` | int | 100% | 150000 |
| `invoiceDate` | date | 100% | "2026-08-20T08:10:56.496Z" |
| `invoiceNumber` | string | 100% | "INV-0001" |
| `invoiceType` | string | 100% | "INSTALLATION" |
| `items` | array | 100% | "[2 item(s)]" |
| `items[]._id` | objectId | 100% | "6a86b690f09ec22a4f0089fd" |
| `items[].amount` | int | 100% | 145000 |
| `items[].description` | string | 100% | "Unit + standard installation" |
| `items[].itemName` | string | 100% | "Airlux SplitCool 12000BTU" |
| `items[].no` | int | 100% | 1 |
| `items[].qty` | int | 100% | 1 |
| `items[].rate` | int | 100% | 145000 |
| `orderId` | objectId | 100% | "6a86b68ff09ec22a4f0089e8" |
| `sentAt` | date | 100% | "2026-08-20T08:10:56.496Z" |
| `serviceCharge` | int | 100% | 0 |
| `status` | string | 100% | "SENT" |
| `subTotal` | int | 100% | 150000 |
| `ticketId` | objectId | 100% | "6a86b68ff09ec22a4f0089f5" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:56.500Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `invoiceNumber_1` on {"invoiceNumber":1} (unique)

---

## Collection: `inspectionreports`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `users`

- Total documents: 9
- Documents scanned: 9

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ef09ec22a4f0089d6" |
| `additionalEmails` | array | 100% | "[0 item(s)]" |
| `address` | string | 100% | "22 Parliament Road, Kotte" |
| `authMethods` | array | 100% | "[1 item(s)]" |
| `createdAt` | date | 100% | "2026-08-20T08:10:54.024Z" |
| `email` | string | 100% | "priyantha@airlux.lk" |
| `emailVerified` | boolean | 100% | false |
| `fullName` | string | 100% | "Priyantha Bandara" |
| `gender` | string | 100% | "" |
| `lastName` | string | 100% | "" |
| `loginAttempts` | int | 100% | 0 |
| `notifications` | array | 89% | "[2 item(s)]" |
| `notifications[]._id` | objectId | 78% | "6a86cad0187344d38f8c4f3a" |
| `notifications[].actionUrl` | string | 78% | "" |
| `notifications[].createdAt` | date | 78% | "2026-08-20T09:37:20.286Z" |
| `notifications[].message` | string | 78% | "The system is currently under maintenanc..." |
| `notifications[].read` | boolean | 78% | false |
| `notifications[].title` | string | 78% | "System Under Maintenance" |
| `notifications[].type` | string | 78% | "general" |
| `passwordHash` | string | 100% | "$2a$10$1jo29zbKH2jA8a/ArBP7qezG.9uN4FBvk..." |
| `phoneNumber` | string | 100% | "+94770000014" |
| `phoneVerified` | boolean | 100% | false |
| `profilePhoto` | string | 100% | "" |
| `role` | string | 100% | "MANAGER" |
| `updatedAt` | date | 100% | "2026-08-20T22:29:01.384Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `email_1` on {"email":1} (unique)
- `phoneNumber_1` on {"phoneNumber":1} (unique)
- `googleUid_1` on {"googleUid":1} (unique)

---

## Collection: `quarantine_items`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b693f09ec22a4f008a1d" |
| `createdAt` | date | 100% | "2026-08-20T08:10:59.089Z" |
| `itemName` | string | 100% | "Defective Copper Piping 1/4\"" |
| `location` | string | 100% | "" |
| `quantity` | int | 100% | 5 |
| `quarantineId` | string | 100% | "Q-0001" |
| `reason` | string | 100% | "Corroded surface" |
| `source` | string | 100% | "manual" |
| `sourceRefId` | string | 100% | "" |
| `status` | string | 100% | "quarantined" |
| `unit` | string | 100% | "meters" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:59.089Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `quarantineId_1` on {"quarantineId":1} (unique)

---

## Collection: `servicerequests`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}
- `serviceRequestRef_1` on {"serviceRequestRef":1} (unique)

---

## Collection: `installationorders`

- Total documents: 0
- Documents scanned: 0

| Field | Type(s) | Present In | Sample |
|---|---|---|---|

**Indexes:**

- `_id_` on {"_id":1}
- `orderReference_1` on {"orderReference":1} (unique)
- `orderId_1` on {"orderId":1} (unique)

---

## Collection: `job_material_requests`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b690f09ec22a4f008a02" |
| `createdAt` | date | 100% | "2026-08-20T08:10:56.834Z" |
| `items` | array | 100% | "[1 item(s)]" |
| `items[]._id` | objectId | 100% | "6a86b690f09ec22a4f008a03" |
| `items[].itemName` | string | 100% | "Copper Piping 1/4\"" |
| `items[].quantity` | int | 100% | 6 |
| `items[].total` | int | 100% | 5100 |
| `items[].unitPrice` | int | 100% | 850 |
| `jobId` | objectId | 100% | "6a86b690f09ec22a4f0089f7" |
| `jobType` | string | 100% | "Installation" |
| `requestedBy` | objectId | 100% | "6a86b68df09ec22a4f0089ca" |
| `status` | string | 100% | "APPROVED" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:56.834Z" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `inspection_tickets`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `_id` | objectId | 100% | "6a89260ac02b24d7095ce539" |
| `approvedAt` | null | 100% | undefined |
| `customerId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |
| `inspectedAt` | null | 100% | undefined |
| `inspectionFee` | int | 100% | 5000 |
| `orderId` | objectId | 100% | "6a86b68ff09ec22a4f0089e8" |
| `rejectedAt` | null | 100% | undefined |
| `rejectionReason` | null | 100% | undefined |
| `reminderSent` | boolean | 100% | false |
| `scheduledAt` | null | 100% | undefined |
| `scheduledDate` | null | 100% | undefined |
| `slipUploadedAt` | date | 100% | "2026-08-22T08:00:00.000Z" |
| `slipUrl` | string | 100% | "data:image/png;base64,iVBORw0KGgoAAAANSU..." |
| `startedAt` | null | 100% | undefined |
| `status` | string | 100% | "PAYMENT_UNDER_REVIEW" |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `carts`

- Total documents: 2
- Documents scanned: 2

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a870e2d28134735b107267b" |
| `additionalCharges` | int | 100% | 0 |
| `createdAt` | date | 100% | "2026-08-20T14:24:45.253Z" |
| `items` | array | 100% | "[0 item(s)]" |
| `items[].product` | objectId | 50% | "6a86b68ef09ec22a4f0089e2" |
| `items[].purchaseType` | string | 50% | "buy_and_install" |
| `items[].quantity` | int | 50% | 1 |
| `updatedAt` | date | 100% | "2026-08-20T14:24:45.253Z" |
| `userId` | string, objectId | 100% | "demo-user" |

**Indexes:**

- `_id_` on {"_id":1}
- `userId_1` on {"userId":1} (unique)

---

## Collection: `counters`

- Total documents: 2
- Documents scanned: 2

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | string | 100% | "orderReference_BO" |
| `seq` | int | 100% | 1 |

**Indexes:**

- `_id_` on {"_id":1}

---

## Collection: `suppliers`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ef09ec22a4f0089dc" |
| `address` | string | 100% | "120 Industrial Zone, Biyagama" |
| `contactPerson` | string | 100% | "Ruwan Bandara" |
| `createdAt` | date | 100% | "2026-08-20T08:10:54.432Z" |
| `email` | string | 100% | "sales@coldchain.lk" |
| `name` | string | 100% | "ColdChain Distributors (Pvt) Ltd" |
| `phone` | string | 100% | "+94112223344" |
| `status` | string | 100% | "active" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:54.432Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `name_1` on {"name":1} (unique)

---

## Collection: `orders`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `_id` | objectId | 100% | "6a89443e3089a9318cbcd9fd" |
| `additionalCharges` | int | 100% | 0 |
| `consultationCompleted` | boolean | 100% | false |
| `createdAt` | date | 100% | "2026-08-22T06:30:00.000Z" |
| `items` | array | 100% | "[1 item(s)]" |
| `items[].name` | string | 100% | "Airlux SplitCool 12000BTU" |
| `items[].price` | int | 100% | 145000 |
| `items[].productId` | string | 100% | "6a86b68ef09ec22a4f0089e2" |
| `items[].purchaseType` | string | 100% | "buy_only" |
| `items[].quantity` | int | 100% | 1 |
| `orderReference` | string | 100% | "ALX-BO-1002" |
| `orderType` | string | 100% | "Buy Only" |
| `paymentSlip` | string | 100% | "/uploads/slips/ALX-BO-1002-slip.jpg" |
| `paymentSlipUrl` | string | 100% | "uploads/slips/ALX-BO-1002-slip.jpg" |
| `paymentStatus` | string | 100% | "Under Review" |
| `shippingDetails` | object | 100% | "{...}" |
| `shippingDetails.address` | string | 100% | "45 Negombo Road" |
| `shippingDetails.city` | string | 100% | "Negombo" |
| `shippingDetails.email` | string | 100% | "nadeesha@example.com" |
| `shippingDetails.firstName` | string | 100% | "Nadeesha" |
| `shippingDetails.lastName` | string | 100% | "Fernando" |
| `shippingDetails.phone` | string | 100% | "+94770000002" |
| `shippingDetails.postalCode` | string | 100% | "11500" |
| `status` | string | 100% | "Under Review (Finance)" |
| `subtotal` | int | 100% | 145000 |
| `total` | int | 100% | 145000 |
| `updatedAt` | date | 100% | "2026-08-22T06:30:00.000Z" |
| `userId` | objectId | 100% | "6a86b68df09ec22a4f0089c8" |

**Indexes:**

- `_id_` on {"_id":1}
- `orderReference_1` on {"orderReference":1} (unique)
- `orderRef_1` on {"orderRef":1} (unique)

---

## Collection: `leftover_returns`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b692f09ec22a4f008a19" |
| `condition` | string | 100% | "good" |
| `createdAt` | date | 100% | "2026-08-20T08:10:58.740Z" |
| `itemId` | objectId | 100% | "6a86b68ff09ec22a4f0089ea" |
| `itemName` | string | 100% | "Copper Piping 1/4\" (per meter)" |
| `itemSku` | string | 100% | "PIPE-CU-025" |
| `jobId` | string | 100% | "JOB-0001" |
| `movedToQuarantine` | boolean | 100% | false |
| `notes` | string | 100% | "" |
| `quantityReturned` | int | 100% | 2 |
| `restoredToStock` | boolean | 100% | false |
| `returnedBy` | string | 100% | "Kasun Silva" |
| `returnId` | string | 100% | "RET-0001" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:58.740Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `returnId_1` on {"returnId":1} (unique)

---

## Collection: `charges`

- Total documents: 1
- Documents scanned: 1

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a86b68ef09ec22a4f0089e0" |
| `amount` | int | 100% | 5000 |
| `createdAt` | date | 100% | "2026-08-20T08:10:54.691Z" |
| `description` | string | 100% | "Charged for pre-installation site inspec..." |
| `name` | string | 100% | "Standard Site Inspection Fee" |
| `type` | string | 100% | "FIXED" |
| `updatedAt` | date | 100% | "2026-08-20T08:10:54.691Z" |

**Indexes:**

- `_id_` on {"_id":1}
- `name_1` on {"name":1} (unique)

---

## Collection: `auditlogs`

- Total documents: 40
- Documents scanned: 40

| Field | Type(s) | Present In | Sample |
|---|---|---|---|
| `__v` | int | 100% | 0 |
| `_id` | objectId | 100% | "6a877f77b772ddb6b9ea506e" |
| `action` | string | 100% | "LOGIN_SUCCESS" |
| `actionCategory` | string | 100% | "LOGIN" |
| `before` | null | 100% | undefined |
| `changes` | object | 10% | "{...}" |
| `changes.after` | object | 10% | "{...}" |
| `changes.after.address` | object | 5% | "{...}" |
| `changes.after.address.newValue` | string | 5% | "123 Galle Road, Colombo 03, Sri Lanka" |
| `changes.after.address.oldValue` | string | 5% | "567 Galle Road, Colombo 03, Sri Lanka" |
| `changes.after.isActive` | object | 5% | "{...}" |
| `changes.after.isActive.newValue` | boolean | 5% | true |
| `changes.after.isActive.oldValue` | boolean | 5% | false |
| `changes.after.maintenanceType` | string | 5% | "Instant" |
| `changes.after.supportEmail` | object | 5% | "{...}" |
| `changes.after.supportEmail.newValue` | string | 5% | "support@airlux.lk" |
| `changes.after.supportEmail.oldValue` | string | 5% | "support@airlux.com" |
| `changes.after.supportPhoneNumber` | object | 5% | "{...}" |
| `changes.after.supportPhoneNumber.newValue` | string | 5% | "+94 11 234 5678" |
| `changes.after.supportPhoneNumber.oldValue` | string | 5% | "+94 12 234 5678" |
| `changes.after.systemName` | object | 5% | "{...}" |
| `changes.after.systemName.newValue` | string | 5% | "AirLux" |
| `changes.after.systemName.oldValue` | string | 5% | "Test Change" |
| `createdAt` | date | 100% | "2026-08-20T22:28:07.826Z" |
| `dataSize` | null | 100% | undefined |
| `entity` | string | 100% | "User" |
| `entityId` | objectId, null | 100% | "6a86b68df09ec22a4f0089d2" |
| `errorDetails` | object | 100% | "{...}" |
| `errorDetails.affectedResource` | null | 100% | undefined |
| `errorDetails.errorMessage` | null | 100% | undefined |
| `errorDetails.errorType` | null | 100% | undefined |
| `errorDetails.stackTrace` | null | 100% | undefined |
| `ipAddress` | string | 100% | "::ffff:127.0.0.1" |
| `logLevel` | string | 100% | "INFO" |
| `logType` | string | 100% | "ACTIVITY" |
| `metadata` | object | 90% | "{...}" |
| `metadata.errorType` | string | 38% | "INVALID_CREDENTIALS" |
| `metadata.loginIdentifier` | string | 90% | "nuwan@airlux.lk" |
| `metadata.loginMethod` | string | 90% | "EMAIL" |
| `metadata.rememberMe` | boolean | 53% | true |
| `metadata.userEmail` | string, null | 90% | "nuwan@airlux.lk" |
| `metadata.userName` | string, null | 90% | "Nuwan Jayewardene" |
| `metadata.userPhone` | null, string | 90% | "+94770000001" |
| `metadata.userRole` | string | 53% | "SERVICE_TEAM" |
| `module` | string | 100% | "AUTH" |
| `performedBy` | objectId, null | 100% | "6a86b68df09ec22a4f0089d2" |
| `performedByRole` | string | 100% | "SERVICE_TEAM" |
| `reason` | null, string | 100% | "Patchs" |
| `requestDetails` | object | 90% | "{...}" |
| `requestDetails.endpoint` | string | 90% | "/api/auth/login" |
| `requestDetails.method` | string | 90% | "POST" |
| `requestDetails.params` | object | 90% | "{...}" |
| `requestDetails.params.email` | string | 90% | "nuwan@airlux.lk" |
| `requestDetails.params.password` | string | 90% | "[REDACTED]" |
| `requestDetails.params.rememberMe` | boolean | 90% | true |
| `resource` | string | 100% | "PaymentSetting" |
| `securityDetails` | object | 100% | "{...}" |
| `securityDetails.attemptCount` | null | 100% | undefined |
| `securityDetails.riskLevel` | null | 100% | undefined |
| `securityDetails.securityFlags` | array | 100% | "[0 item(s)]" |
| `status` | string | 100% | "SUCCESS" |
| `statusCode` | null | 100% | undefined |
| `timestamp` | date | 100% | "2026-08-20T22:28:07.826Z" |
| `userAgent` | string | 100% | "Mozilla/5.0 (Windows NT 10.0; Win64; x64..." |

**Indexes:**

- `_id_` on {"_id":1}
- `createdAt_-1` on {"createdAt":-1}
- `performedBy_1` on {"performedBy":1}
- `performedByRole_1` on {"performedByRole":1}
- `entity_1_entityId_1` on {"entity":1,"entityId":1}
- `logType_1` on {"logType":1}
- `module_1` on {"module":1}
- `actionCategory_1` on {"actionCategory":1}
- `status_1` on {"status":1}
- `createdAt_-1_logType_1_module_1` on {"createdAt":-1,"logType":1,"module":1}
- `performedBy_1_createdAt_-1` on {"performedBy":1,"createdAt":-1}
- `performedByRole_1_createdAt_-1` on {"performedByRole":1,"createdAt":-1}

---

