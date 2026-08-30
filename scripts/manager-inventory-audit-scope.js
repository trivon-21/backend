'use strict';

const modelDefinitions = {
  User: { module: '../src/models/User', risk: 'standard' },
  Order: { module: '../src/models/Order', risk: 'standard' },
  SystemConfig: { module: '../src/models/SystemConfig', risk: 'standard' },
  Inventory: { module: '../src/models/Inventory', risk: 'standard' },
  Activity: { module: '../src/models/Activity', risk: 'standard' },
  Supplier: { module: '../src/models/Supplier', risk: 'standard' },
  Procurement: { module: '../src/models/Procurement', risk: 'medium' },
  DispatchOrder: { module: '../src/models/DispatchOrder', risk: 'standard' },
  WarehousePickRequest: { module: '../src/models/WarehousePickRequest', risk: 'standard' },
  JobMaterialRequest: { module: '../src/models/JobMaterialRequest', risk: 'standard' },
  AssetLoan: { module: '../src/models/AssetLoan', risk: 'standard' },
  PurchaseRequest: { module: '../src/models/PurchaseRequest', risk: 'high' },
  ReceiptAuthorization: { module: '../src/models/ReceiptAuthorization', risk: 'high' },
  LeftoverReturn: { module: '../src/models/LeftoverReturn', risk: 'medium' },
  RmaCase: { module: '../src/models/RmaCase', risk: 'medium' },
  QuarantineItem: { module: '../src/models/QuarantineItem', risk: 'medium' },
  ManagerServiceTicket: { module: '../src/models/ServiceTicket', risk: 'standard' },
  ManagerInspectionTicket: { module: '../src/models/InspectionTicket', risk: 'high' },
  ManagerInstallation: { module: '../src/models/Installation', risk: 'standard' },
  TechTeam: { module: '../src/modules/shared/tech-teams/techTeam.model', risk: 'standard' },
  WorkflowServiceTicket: { module: '../src/modules/shared/serviceTicket/serviceTicket.model', risk: 'standard' },
  WorkflowInstallation: { module: '../src/modules/shared/installation/installation.model', risk: 'standard' },
  Repair: { module: '../src/modules/shared/repair/repair.model', risk: 'standard' },
  Maintenance: { module: '../src/modules/shared/maintenance/maintenance.model', risk: 'standard' },
};

const endpoint = (role, method, route, feature, uiReachable, handler, models) => ({
  role,
  method,
  route,
  feature,
  uiReachable,
  handler,
  models,
});

const managerEndpoints = [
  endpoint('manager', 'GET', '/', 'Status', false, 'manager.controller.getStatus', []),
  endpoint('manager', 'POST', '/payments/auto-cancel', 'Payment auto-cancellation', false, 'manager.service.triggerPaymentAutoCancelJob', ['Order', 'SystemConfig']),
  endpoint('manager', 'GET', '/dashboard', 'Manager dashboard', true, 'manager.service.getDashboardData', ['ManagerServiceTicket', 'ManagerInspectionTicket', 'ManagerInstallation', 'PurchaseRequest', 'Inventory', 'WarehousePickRequest', 'ReceiptAuthorization', 'User']),
  endpoint('manager', 'GET', '/analytics', 'Manager analytics', true, 'manager.analytics.service.getAnalyticsData', ['ManagerServiceTicket', 'ManagerInspectionTicket', 'ManagerInstallation', 'PurchaseRequest', 'Inventory', 'WarehousePickRequest', 'Procurement', 'ReceiptAuthorization', 'User']),
  endpoint('manager', 'GET', '/tickets', 'Legacy ticket list', false, 'manager.tickets.service.listTickets', ['ManagerServiceTicket', 'ManagerInspectionTicket', 'ManagerInstallation', 'ReceiptAuthorization', 'Inventory', 'User']),
  endpoint('manager', 'GET', '/technicians', 'Legacy technician list', false, 'manager.tickets.service.listTechnicians', ['User']),
  endpoint('manager', 'PATCH', '/tickets/:id', 'Legacy ticket update', false, 'manager.tickets.service.updateTicket', ['ManagerServiceTicket', 'User']),
  endpoint('manager', 'GET', '/work-items', 'Operational work items', true, 'manager.tickets.service.listWorkItems', ['ManagerServiceTicket', 'ManagerInspectionTicket', 'ManagerInstallation', 'ReceiptAuthorization', 'Inventory', 'User']),
  endpoint('manager', 'PATCH', '/work-items/:sourceType/:sourceId/control', 'Work-item controls', true, 'manager.tickets.service.updateWorkItemControl', ['ManagerServiceTicket', 'User']),
  endpoint('manager', 'POST', '/work-items/:sourceType/:sourceId/:action', 'Work-item actions', true, 'manager.tickets.service.runWorkItemAction', ['ManagerServiceTicket', 'Activity', 'User']),
  endpoint('manager', 'GET', '/orders', 'Purchase approvals', true, 'manager.orders.service.listOrders', ['PurchaseRequest', 'Inventory', 'Supplier']),
  endpoint('manager', 'PATCH', '/orders/:id', 'Purchase decision', true, 'manager.orders.service.decideOrder', ['PurchaseRequest', 'Activity', 'Inventory', 'Supplier']),
  endpoint('manager', 'GET', '/receipt-authorizations', 'Non-PO approvals', true, 'manager.orders.service.listReceiptAuthorizations', ['ReceiptAuthorization', 'Inventory', 'Supplier']),
  endpoint('manager', 'POST', '/receipt-authorizations/:id/decision', 'Non-PO decision', true, 'manager.orders.service.decideReceiptAuthorization', ['ReceiptAuthorization', 'Activity', 'Inventory', 'Supplier']),
];

const inventoryEndpoints = [
  endpoint('inventory', 'GET', '/dashboard', 'Inventory dashboard', true, 'inventory_manager.service.getDashboardData', ['Inventory', 'Activity', 'DispatchOrder', 'AssetLoan', 'WarehousePickRequest', 'PurchaseRequest', 'ReceiptAuthorization', 'User']),
  endpoint('inventory', 'GET', '/list', 'Inventory list', true, 'inventory_manager.service.getInventoryList', ['Inventory', 'Supplier', 'User']),
  endpoint('inventory', 'GET', '/item/:id', 'Inventory detail', true, 'inventory_manager.service.getInventoryItem', ['Inventory', 'Supplier', 'User']),
  endpoint('inventory', 'PUT', '/item/:id', 'Inventory master-data update', false, 'inventory_manager.service.updateInventoryItem', ['Inventory', 'Supplier', 'User']),
  endpoint('inventory', 'PATCH', '/item/:id', 'Inventory master-data update', true, 'inventory_manager.service.updateInventoryItem', ['Inventory', 'Supplier', 'User']),
  endpoint('inventory', 'POST', '/item', 'Inventory catalog creation', true, 'inventory_manager.service.createInventoryItem', ['Inventory', 'Supplier', 'User']),
  endpoint('inventory', 'POST', '/receipts', 'Goods receipt', true, 'inventory_manager.service.receiveInventory', ['Inventory', 'PurchaseRequest', 'Supplier', 'ReceiptAuthorization', 'Procurement', 'Activity', 'User']),
  endpoint('inventory', 'GET', '/suppliers', 'Supplier list', true, 'inventory_manager.service.getSuppliersList', ['Supplier', 'User']),
  endpoint('inventory', 'POST', '/suppliers', 'Supplier creation', true, 'inventory_manager.service.createSupplier', ['Supplier', 'User']),
  endpoint('inventory', 'GET', '/procurements', 'Procurement history', true, 'inventory_manager.service.getRecentProcurements', ['Procurement', 'Supplier', 'Inventory', 'User']),
  endpoint('inventory', 'GET', '/receipt-authorizations', 'Receipt authorization list', true, 'inventory_manager.service.getReceiptAuthorizations', ['ReceiptAuthorization', 'Inventory', 'Supplier', 'User']),
  endpoint('inventory', 'POST', '/receipt-authorizations', 'Receipt authorization creation', true, 'inventory_manager.service.createReceiptAuthorization', ['ReceiptAuthorization', 'Inventory', 'Supplier', 'ManagerServiceTicket', 'ManagerInspectionTicket', 'ManagerInstallation', 'Activity', 'User']),
  endpoint('inventory', 'GET', '/orders', 'Dispatch and logistics', true, 'inventory_manager.service.getOrders', ['DispatchOrder', 'User']),
  endpoint('inventory', 'PATCH', '/orders/:id', 'Dispatch update', true, 'inventory_manager.service.updateOrder', ['DispatchOrder', 'User']),
  endpoint('inventory', 'GET', '/material-requests', 'Material requests', true, 'inventory_manager.service.getMaterialRequests', ['WarehousePickRequest', 'Inventory', 'User']),
  endpoint('inventory', 'PATCH', '/material-requests/:id/items/:lineId', 'Material-line confirmation', true, 'inventory_manager.service.confirmMaterialItem', ['WarehousePickRequest', 'User']),
  endpoint('inventory', 'POST', '/material-requests/:id/reserve', 'Material reservation', true, 'inventory_manager.service.reserveMaterialRequest', ['WarehousePickRequest', 'Inventory', 'JobMaterialRequest', 'WorkflowServiceTicket', 'Repair', 'WorkflowInstallation', 'Maintenance', 'Activity', 'User']),
  endpoint('inventory', 'POST', '/material-requests/:id/release', 'Material reservation release', true, 'inventory_manager.service.releaseMaterialRequest', ['WarehousePickRequest', 'Inventory', 'JobMaterialRequest', 'TechTeam', 'WorkflowServiceTicket', 'Repair', 'WorkflowInstallation', 'Maintenance', 'User']),
  endpoint('inventory', 'POST', '/material-requests/:id/handover', 'Material handover', true, 'inventory_manager.service.handoverMaterialRequest', ['WarehousePickRequest', 'Inventory', 'JobMaterialRequest', 'Activity', 'User']),
  endpoint('inventory', 'GET', '/technicians', 'Technician list', true, 'inventory_manager.service.getTechnicians', ['User']),
  endpoint('inventory', 'GET', '/asset-loans', 'Active asset loans', true, 'inventory_manager.service.getAssetLoans', ['AssetLoan', 'User']),
  endpoint('inventory', 'GET', '/available-tools', 'Available serialized tools', true, 'inventory_manager.service.getAvailableTools', ['Inventory', 'AssetLoan', 'User']),
  endpoint('inventory', 'POST', '/asset-loans', 'Tool checkout', true, 'inventory_manager.service.checkOutTool', ['AssetLoan', 'Inventory', 'Activity', 'User']),
  endpoint('inventory', 'POST', '/asset-loans/return/:id', 'Tool return', true, 'inventory_manager.service.returnTool', ['AssetLoan', 'Activity', 'User']),
  endpoint('inventory', 'GET', '/asset-return-logs', 'Returned-tool history', true, 'inventory_manager.service.getAssetReturnLogs', ['AssetLoan', 'User']),
  endpoint('inventory', 'GET', '/order-requests', 'Purchase-request list', true, 'inventory_manager.service.getOrderRequests', ['PurchaseRequest', 'Supplier', 'User']),
  endpoint('inventory', 'POST', '/order-requests', 'Purchase-request creation', true, 'inventory_manager.service.createOrderRequest', ['PurchaseRequest', 'Inventory', 'Supplier', 'WarehousePickRequest', 'User']),
  endpoint('inventory', 'PATCH', '/order-requests/:id', 'Purchase-request update', true, 'inventory_manager.service.updateOrderRequest', ['PurchaseRequest', 'Inventory', 'Supplier', 'User']),
  endpoint('inventory', 'POST', '/order-requests/:id/submit', 'Purchase-request submission', true, 'inventory_manager.service.submitOrderRequest', ['PurchaseRequest', 'Activity', 'User']),
  endpoint('inventory', 'POST', '/order-requests/:id/issue-po', 'Purchase-order issuance', true, 'inventory_manager.service.issuePurchaseOrder', ['PurchaseRequest', 'Activity', 'User']),
  endpoint('inventory', 'PATCH', '/order-requests/:id/approve', 'Legacy inventory approval', false, 'inventory_manager.service.retiredInventoryApproval', ['PurchaseRequest', 'User']),
  endpoint('inventory', 'PATCH', '/order-requests/:id/reject', 'Legacy inventory rejection', false, 'inventory_manager.service.retiredInventoryApproval', ['PurchaseRequest', 'User']),
  endpoint('inventory', 'GET', '/suggested-orders', 'Reorder suggestions', true, 'inventory_manager.service.getSuggestedOrders', ['Inventory', 'PurchaseRequest', 'User']),
  endpoint('inventory', 'GET', '/activity', 'Inventory activity log', true, 'inventory_manager.service.getActivityLog', ['Activity', 'User']),
  endpoint('inventory', 'GET', '/returns-summary', 'Returns summary', true, 'inventory_manager.service.getReturnsSummary', ['LeftoverReturn', 'RmaCase', 'QuarantineItem', 'User']),
  endpoint('inventory', 'GET', '/leftover-returns', 'Leftover-return list', true, 'inventory_manager.service.getLeftoverReturns', ['LeftoverReturn', 'User']),
  endpoint('inventory', 'POST', '/leftover-returns', 'Leftover return', true, 'inventory_manager.service.createLeftoverReturn', ['LeftoverReturn', 'WarehousePickRequest', 'Inventory', 'QuarantineItem', 'Activity', 'User']),
  endpoint('inventory', 'GET', '/rma-cases', 'RMA list', true, 'inventory_manager.service.getRmaCases', ['RmaCase', 'User']),
  endpoint('inventory', 'POST', '/rma-cases', 'RMA creation', true, 'inventory_manager.service.createRmaCase', ['RmaCase', 'Inventory', 'User']),
  endpoint('inventory', 'PATCH', '/rma-cases/:id', 'RMA update', true, 'inventory_manager.service.updateRmaCase', ['RmaCase', 'User']),
  endpoint('inventory', 'GET', '/quarantine', 'Quarantine list', true, 'inventory_manager.service.getQuarantineItems', ['QuarantineItem', 'User']),
  endpoint('inventory', 'POST', '/quarantine', 'Quarantine creation', true, 'inventory_manager.service.createQuarantineItem', ['QuarantineItem', 'Inventory', 'User']),
  endpoint('inventory', 'PATCH', '/quarantine/:id/dispose', 'Quarantine disposal', true, 'inventory_manager.service.disposeQuarantineItem', ['QuarantineItem', 'User']),
];

const collectionUsage = {
  users: {
    read: ['_id', 'fullName', 'email', 'phoneNumber', 'address', 'role', 'isActive', 'deactivationReason'],
    filter: ['_id', 'role'],
  },
  orders: {
    read: ['_id', 'orderRef', 'orderReference', 'orderId', 'customer', 'userId', 'amount', 'total', 'subtotal', 'createdAt', 'paymentStatus', 'orderStatus'],
    filter: ['_id', 'customer', 'userId', 'paymentStatus', 'orderStatus', 'createdAt'],
    write: ['customer', 'userId', 'orderStatus', 'paymentStatus', 'status'],
  },
  systemconfigs: { read: ['businessRules.paymentAutoCancelDays', 'updatedBy'], filter: [], populate: ['updatedBy'] },
  inventory: {
    read: ['_id', 'name', 'sku', 'available', 'reserved', 'reorderLevel', 'maxStockLevel', 'status', 'type', 'category', 'itemClass', 'subcategory', 'brand', 'manufacturerPartNumber', 'compatibleModels', 'systemType', 'refrigerants', 'capacityBtu', 'voltage', 'phase', 'location', 'binLocation', 'supplierId', 'unit', 'unitCost', 'pricing.costPerUnit', 'pricing.profitMargin', 'pricing.sellingPricePerUnit', 'isSerialized', 'serialNumbers', 'specsUrl', 'createdAt', 'updatedAt'],
    filter: ['_id', 'sku', 'itemClass', 'isSerialized', 'serialNumbers', 'available', 'reorderLevel'],
    sort: ['name', 'updatedAt'],
    populate: ['supplierId'],
    write: ['name', 'sku', 'available', 'reserved', 'status', 'category', 'itemClass', 'subcategory', 'brand', 'manufacturerPartNumber', 'compatibleModels', 'systemType', 'refrigerants', 'capacityBtu', 'voltage', 'phase', 'location', 'binLocation', 'supplierId', 'unit', 'unitCost', 'pricing.costPerUnit', 'pricing.profitMargin', 'pricing.sellingPricePerUnit', 'isSerialized', 'serialNumbers', 'specsUrl'],
  },
  activities: {
    read: ['_id', 'type', 'title', 'description', 'timestamp', 'actionLabel', 'actionUrl', 'createdAt'],
    filter: ['type'], sort: ['timestamp', 'createdAt'],
    write: ['type', 'title', 'description', 'actionLabel', 'actionUrl'],
  },
  suppliers: {
    read: ['_id', 'name', 'contactPerson', 'email', 'phone', 'address', 'status'],
    filter: ['_id', 'name'], sort: ['name'], write: ['name', 'status'],
  },
  procurements: {
    read: ['_id', 'receiptMode', 'orderRequestId', 'orderLineId', 'receiptAuthorizationId', 'receiptEventId', 'poNumber', 'supplierId', 'supplierName', 'inventoryId', 'itemName', 'sku', 'itemClass', 'subcategory', 'brand', 'quantity', 'unit', 'unitCost', 'totalCost', 'condition', 'binLocation', 'receivedBy', 'receivedDate', 'sourceDocumentNumber', 'supportingDocumentUrl', 'nonPoReason', 'affectedWorkReference', 'timestamp', 'createdAt'],
    filter: ['_id', 'receiptEventId'], sort: ['receivedDate', 'timestamp'], populate: ['supplierId', 'inventoryId'],
    write: ['receiptMode', 'orderRequestId', 'orderLineId', 'receiptAuthorizationId', 'receiptEventId', 'poNumber', 'supplierId', 'supplierName', 'inventoryId', 'itemName', 'sku', 'itemClass', 'subcategory', 'brand', 'quantity', 'unit', 'unitCost', 'totalCost', 'condition', 'binLocation', 'receivedBy', 'receivedDate', 'sourceDocumentNumber', 'supportingDocumentUrl', 'nonPoReason', 'affectedWorkReference'],
  },
  dispatch_orders: {
    read: ['_id', 'orderId', 'customer', 'date', 'type', 'items', 'status', 'courier', 'trackId', 'sourceOrderId', 'sourceOrderType', 'completedAt', 'lastMovedAt', 'createdAt'],
    filter: ['orderId'], sort: ['createdAt'], write: ['status', 'courier', 'trackId', 'items', 'completedAt', 'lastMovedAt'],
  },
  warehouse_pick_requests: {
    read: ['_id', 'requestId', 'sourceMaterialRequestId', 'jobId', 'jobType', 'requester', 'requesterId', 'date', 'location', 'items', 'items[].lineId', 'items[].inventoryId', 'items[].name', 'items[].sku', 'items[].qty', 'items[].confirmed', 'items[].returnedQty', 'status', 'statusVersion', 'assignedTeamId', 'assignedTeamName', 'completedAt', 'lastMovedAt', 'createdAt'],
    filter: ['_id', 'requestId', 'sourceMaterialRequestId', 'jobId', 'status', 'statusVersion', 'items[].lineId'],
    sort: ['createdAt'],
    write: ['items[].confirmed', 'items[].returnedQty', 'status', 'statusVersion', 'assignedTeamId', 'assignedTeamName', 'completedAt', 'lastMovedAt'],
  },
  job_material_requests: {
    read: ['_id', 'requestId', 'jobId', 'jobType', 'status', 'fulfillmentStatus', 'financeDecision', 'warehousePickRequestId', 'statusVersion'],
    filter: ['_id', 'requestId', 'jobId'],
    write: ['status', 'fulfillmentStatus', 'warehousePickRequestId', 'statusVersion'],
  },
  asset_loans: {
    read: ['_id', 'toolId', 'toolName', 'assetTag', 'technicianId', 'technicianUserId', 'technicianName', 'checkedOutAt', 'dueDate', 'returnedAt', 'condition', 'status', 'createdAt'],
    filter: ['_id', 'assetTag', 'status'], sort: ['checkedOutAt', 'returnedAt'],
    write: ['toolId', 'toolName', 'assetTag', 'technicianId', 'technicianUserId', 'technicianName', 'checkedOutAt', 'dueDate', 'returnedAt', 'condition', 'status'],
  },
  purchase_requests: {
    read: ['_id', 'requestId', 'supplierId', 'supplierName', 'requestedBy', 'requestedById', 'items', 'items[].lineId', 'items[].inventoryId', 'items[].supplierId', 'items[].name', 'items[].sku', 'items[].itemClass', 'items[].subcategory', 'items[].unit', 'items[].quantity', 'items[].orderedQuantity', 'items[].receivedQuantity', 'items[].unitCost', 'items[].estimatedTotal', 'totalEstimate', 'priority', 'status', 'statusVersion', 'operationalApproval', 'financialApproval', 'decisionHistory', 'poNumber', 'approvedBy', 'approvedAt', 'rejectionReason', 'rejectedAt', 'orderedAt', 'source', 'sourceMaterialRequestId', 'activeShortageKey', 'notes', 'createdAt', 'updatedAt'],
    filter: ['_id', 'requestId', 'status', 'source', 'sourceMaterialRequestId', 'activeShortageKey'],
    sort: ['createdAt', 'updatedAt'], populate: ['items[].supplierId', 'items[].inventoryId', 'supplierId'],
    write: ['supplierId', 'supplierName', 'requestedBy', 'requestedById', 'items', 'totalEstimate', 'priority', 'status', 'statusVersion', 'operationalApproval', 'financialApproval', 'decisionHistory', 'poNumber', 'approvedBy', 'approvedAt', 'rejectionReason', 'rejectedAt', 'orderedAt', 'source', 'sourceMaterialRequestId', 'activeShortageKey', 'notes'],
  },
  receipt_authorizations: {
    read: ['_id', 'authorizationNumber', 'receiptMode', 'nonPoReason', 'explanation', 'inventoryId', 'newItemSnapshot', 'supplierId', 'supplierName', 'authorizedQuantity', 'receivedQuantity', 'unitCost', 'estimatedTotal', 'affectedWorkType', 'affectedWorkId', 'affectedWorkReference', 'sourceDocumentNumber', 'supportingDocumentUrl', 'requestedById', 'requestedByName', 'status', 'statusVersion', 'approvedById', 'approvedByName', 'approvedAt', 'approvalComment', 'rejectedAt', 'rejectionReason', 'financeReviewStatus', 'financeComment', 'financeReference', 'financeReviewedAt', 'financeReviewedById', 'createdAt', 'updatedAt'],
    filter: ['_id', 'authorizationNumber', 'status', 'affectedWorkId', 'affectedWorkReference'],
    sort: ['createdAt', 'updatedAt'], populate: ['inventoryId', 'supplierId'],
    write: ['authorizationNumber', 'receiptMode', 'nonPoReason', 'explanation', 'inventoryId', 'newItemSnapshot', 'supplierId', 'supplierName', 'authorizedQuantity', 'receivedQuantity', 'unitCost', 'estimatedTotal', 'affectedWorkType', 'affectedWorkId', 'affectedWorkReference', 'sourceDocumentNumber', 'supportingDocumentUrl', 'requestedById', 'requestedByName', 'status', 'statusVersion', 'approvedById', 'approvedByName', 'approvedAt', 'approvalComment', 'rejectedAt', 'rejectionReason', 'financeReviewStatus', 'financeComment', 'financeReference', 'financeReviewedAt', 'financeReviewedById'],
  },
  leftover_returns: {
    read: ['_id', 'returnId', 'jobId', 'warehousePickRequestId', 'warehouseLineId', 'itemId', 'itemName', 'itemSku', 'quantityReturned', 'condition', 'returnedBy', 'notes', 'restoredToStock', 'movedToQuarantine', 'createdAt'],
    filter: ['jobId', 'warehousePickRequestId', 'warehouseLineId', 'itemId'], sort: ['createdAt'],
    write: ['returnId', 'jobId', 'warehousePickRequestId', 'warehouseLineId', 'itemId', 'itemName', 'itemSku', 'quantityReturned', 'condition', 'returnedBy', 'notes', 'restoredToStock', 'movedToQuarantine'],
  },
  rma_cases: {
    read: ['_id', 'rmaId', 'serialNumber', 'inventoryId', 'itemName', 'itemSku', 'faultDescription', 'reportedBy', 'status', 'type', 'resolution', 'resolvedAt', 'createdAt'],
    filter: ['rmaId', 'serialNumber', 'status'], sort: ['createdAt'],
    write: ['rmaId', 'serialNumber', 'inventoryId', 'itemName', 'itemSku', 'faultDescription', 'reportedBy', 'status', 'type', 'resolution', 'resolvedAt'],
  },
  quarantine_items: {
    read: ['_id', 'quarantineId', 'itemName', 'quantity', 'unit', 'reason', 'location', 'source', 'sourceRefId', 'status', 'disposedAt', 'disposedBy', 'createdAt'],
    filter: ['quarantineId', 'status'], sort: ['createdAt'],
    write: ['quarantineId', 'itemName', 'quantity', 'unit', 'reason', 'location', 'source', 'sourceRefId', 'status', 'disposedAt', 'disposedBy'],
  },
  service_tickets: {
    read: ['_id', 'customerId', 'requestType', 'description', 'orderId', 'serviceType', 'serviceFee', 'paymentStatus', 'paymentSlipUrl', 'rejectionReason', 'subject', 'category', 'priority', 'status', 'assignedTechnicianId', 'slaDueAt', 'resolvedAt', 'createdAt', 'updatedAt', '__v'],
    filter: ['_id', 'status', 'assignedTechnicianId'], populate: ['customerId', 'assignedTechnicianId'],
    write: ['priority', 'status', 'assignedTechnicianId', 'slaDueAt', 'resolvedAt'],
  },
  inspection_tickets: {
    read: ['_id', 'customerId', 'orderId', 'status', 'inspectionFee', 'scheduledDate', 'scheduledAt', 'startedAt', 'inspectedAt', 'slipUrl', 'rejectionReason', 'createdAt', 'updatedAt'],
    filter: ['_id'], populate: ['customerId'],
  },
  installations: {
    read: ['_id', 'orderId', 'inspectionTicketId', 'customerId', 'assignedTeamId', 'assignedTeamName', 'productType', 'units', 'location', 'serviceDate', 'siteDetails', 'materials', 'status', 'createdAt', 'updatedAt'],
    filter: ['_id'], populate: ['customerId'], write: ['status'],
  },
  tech_teams: { read: ['_id', 'teamName', 'status', 'activeJobsCount'], filter: ['_id'], write: ['activeJobsCount'] },
  repairs: { read: ['_id', 'status'], filter: ['_id'], write: ['status'] },
  maintenances: { read: ['_id', 'status'], filter: ['_id'], write: ['status'] },
};

const frontendFields = [
  { collection: 'inventory', field: 'capacityBtu', classification: 'persisted-optional', note: 'Optional catalog attribute; absent from the sampled document.' },
  { collection: 'inventory', field: 'availableSerialNumbers', classification: 'derived', note: 'Calculated from serial numbers and active loans; never persisted.' },
  { collection: 'inventory', field: 'suggestedQuantity', classification: 'derived', note: 'Calculated for reorder suggestions.' },
  { collection: 'inventory', field: 'supplierName', classification: 'populated', note: 'Derived from the supplierId reference or response normalization.' },
  { collection: 'inventory', field: 'time', classification: 'presentation-only', note: 'Frontend display value.' },
  { collection: 'purchase_requests', field: 'items[].orderedQuantity', classification: 'persisted-safe-fallback', note: 'Frontend falls back to quantity when the field is absent.' },
  { collection: 'purchase_requests', field: 'operationalApproval', classification: 'persisted-optional', note: 'Created during operational approval.' },
  { collection: 'purchase_requests', field: 'financialApproval', classification: 'persisted-optional', note: 'Created during finance approval.' },
  { collection: 'purchase_requests', field: 'poNumber', classification: 'persisted-optional', note: 'Created after PO issuance.' },
  { collection: 'purchase_requests', field: 'approvedAt', classification: 'persisted-optional', note: 'Created only for approved workflow states.' },
  { collection: 'purchase_requests', field: 'rejectedAt', classification: 'persisted-optional', note: 'Created only for rejected workflow states.' },
  { collection: 'purchase_requests', field: 'sourceMaterialRequestId', classification: 'persisted-optional', note: 'Only used by material-request-sourced purchases.' },
];

const classificationOverrides = {
  'purchase_requests.items[].orderedQuantity': 'used-with-safe-fallback',
  'purchase_requests.operationalApproval': 'unobserved-workflow-optional',
  'purchase_requests.financialApproval': 'unobserved-workflow-optional',
  'purchase_requests.poNumber': 'unobserved-workflow-optional',
  'purchase_requests.approvedAt': 'unobserved-workflow-optional',
  'purchase_requests.rejectedAt': 'unobserved-workflow-optional',
  'purchase_requests.sourceMaterialRequestId': 'unobserved-workflow-optional',
  'inventory.capacityBtu': 'unobserved-optional',
};

const namingCandidates = [
  { left: 'inspectiontickets', right: 'inspection_tickets', inScope: false, relation: 'retired-manager-binding-versus-canonical' },
  { left: 'inspectionreports', right: 'inspection_reports', inScope: false, relation: 'name-similar' },
  { left: 'installationorders', right: 'installation_orders', inScope: false, relation: 'name-similar' },
  { left: 'servicerequests', right: 'repairs', inScope: false, relation: 'domain-review-required' },
  { left: 'configs', right: 'config', inScope: false, relation: 'name-similar' },
  { left: 'auditlogs', right: 'audit_logs', inScope: false, relation: 'name-similar-inverse-population' },
];

const excludedCollections = [
  { collection: 'asset_return_logs', reason: 'Dormant model only. The /inventory/asset-return-logs endpoint queries returned documents in asset_loans.' },
  { collection: 'logistics', reason: 'Dormant model and compatibility-script reference; no in-scope route imports or queries it.' },
  { collection: 'tickets', reason: 'Legacy generic collection; no in-scope route imports or queries it.' },
];

module.exports = {
  modelDefinitions,
  endpoints: [...managerEndpoints, ...inventoryEndpoints],
  collectionUsage,
  frontendFields,
  classificationOverrides,
  namingCandidates,
  excludedCollections,
  routeSources: {
    manager: '../src/modules/manager/manager.routes.js',
    inventory: '../src/modules/inventory-manager/inventory_manager.routes.js',
  },
};
