const assert = require('node:assert/strict');
const service = require('../../src/modules/inventory-manager/inventory_manager.service');
const catalogService = require('../../src/modules/inventory-manager/services/catalog.service');
const procurementService = require('../../src/modules/inventory-manager/services/procurement.service');
const dispatchService = require('../../src/modules/inventory-manager/services/dispatch.service');
const materialRequestService = require('../../src/modules/inventory-manager/services/material-request.service');
const assetLoanService = require('../../src/modules/inventory-manager/services/asset-loan.service');
const purchasingService = require('../../src/modules/inventory-manager/services/purchasing.service');
const returnsRmaService = require('../../src/modules/inventory-manager/services/returns-rma.service');
const quarantineService = require('../../src/modules/inventory-manager/services/quarantine.service');
const dashboardService = require('../../src/modules/inventory-manager/services/dashboard.service');
const shared = require('../../src/modules/inventory-manager/services/shared');

describe('Inventory Capability Decomposition Characterization & Contracts (AR-02 / Epic 19)', () => {
  it('exports all 44 capability domain methods on the inventory_manager.service facade', () => {
    const expectedMethods = [
      // Catalog
      'getInventoryList',
      'getInventoryItem',
      'getInventoryLocations',
      'updateInventoryItem',
      'createInventoryItem',
      'getSuppliersList',
      'createSupplier',
      'getSuggestedOrders',
      // Procurement & Receiving
      'createReceiptAuthorization',
      'getReceiptAuthorizations',
      'receiveInventory',
      'getRecentProcurements',
      'getProcurementSummary',
      'getReceiptDiscrepancies',
      // Dispatch
      'getOrders',
      'updateOrder',
      // Material Requests
      'getMaterialRequests',
      'confirmMaterialItem',
      'reserveMaterialRequest',
      'releaseMaterialRequest',
      'handoverMaterialRequest',
      // Asset Loans
      'getTechnicians',
      'getAssetLoans',
      'getAvailableTools',
      'checkOutTool',
      'returnTool',
      'getAssetReturnLogs',
      // Purchasing
      'getOrderRequests',
      'createOrderRequest',
      'updateOrderRequest',
      'submitOrderRequest',
      'issuePurchaseOrder',
      'retiredInventoryApproval',
      // Returns & RMA
      'getLeftoverReturns',
      'createLeftoverReturn',
      'getRmaCases',
      'createRmaCase',
      'updateRmaCase',
      'receiveRmaReplacement',
      'getReturnsSummary',
      // Quarantine
      'getQuarantineItems',
      'createQuarantineItem',
      'disposeQuarantineItem',
      // Dashboard
      'getDashboardData',
      'getActivityLog',
    ];

    assert.equal(expectedMethods.length, 45, 'Must track all 45 domain methods');

    for (const methodName of expectedMethods) {
      assert.equal(
        typeof service[methodName],
        'function',
        `Facade method '${methodName}' must be defined as a function on inventory_manager.service`
      );
    }
  });

  it('delegates catalog capability methods directly to catalog.service', () => {
    assert.equal(service.getInventoryList, catalogService.getInventoryList);
    assert.equal(service.getInventoryItem, catalogService.getInventoryItem);
    assert.equal(service.getInventoryLocations, catalogService.getInventoryLocations);
    assert.equal(service.updateInventoryItem, catalogService.updateInventoryItem);
    assert.equal(service.createInventoryItem, catalogService.createInventoryItem);
    assert.equal(service.getSuppliersList, catalogService.getSuppliersList);
    assert.equal(service.createSupplier, catalogService.createSupplier);
    assert.equal(service.getSuggestedOrders, catalogService.getSuggestedOrders);
  });

  it('delegates receiving and procurement methods directly to procurement.service', () => {
    assert.equal(service.createReceiptAuthorization, procurementService.createReceiptAuthorization);
    assert.equal(service.getReceiptAuthorizations, procurementService.getReceiptAuthorizations);
    assert.equal(service.receiveInventory, procurementService.receiveInventory);
    assert.equal(service.getRecentProcurements, procurementService.getRecentProcurements);
    assert.equal(service.getProcurementSummary, procurementService.getProcurementSummary);
    assert.equal(service.getReceiptDiscrepancies, procurementService.getReceiptDiscrepancies);
  });

  it('delegates dispatch methods directly to dispatch.service', () => {
    assert.equal(service.getOrders, dispatchService.getOrders);
    assert.equal(service.updateOrder, dispatchService.updateOrder);
  });

  it('delegates material request methods directly to material-request.service', () => {
    assert.equal(service.getMaterialRequests, materialRequestService.getMaterialRequests);
    assert.equal(service.confirmMaterialItem, materialRequestService.confirmMaterialItem);
    assert.equal(service.reserveMaterialRequest, materialRequestService.reserveMaterialRequest);
    assert.equal(service.releaseMaterialRequest, materialRequestService.releaseMaterialRequest);
    assert.equal(service.handoverMaterialRequest, materialRequestService.handoverMaterialRequest);
  });

  it('delegates asset loan methods directly to asset-loan.service', () => {
    assert.equal(service.getTechnicians, assetLoanService.getTechnicians);
    assert.equal(service.getAssetLoans, assetLoanService.getAssetLoans);
    assert.equal(service.getAvailableTools, assetLoanService.getAvailableTools);
    assert.equal(service.checkOutTool, assetLoanService.checkOutTool);
    assert.equal(service.returnTool, assetLoanService.returnTool);
    assert.equal(service.getAssetReturnLogs, assetLoanService.getAssetReturnLogs);
  });

  it('delegates purchasing methods directly to purchasing.service', () => {
    assert.equal(service.getOrderRequests, purchasingService.getOrderRequests);
    assert.equal(service.createOrderRequest, purchasingService.createOrderRequest);
    assert.equal(service.updateOrderRequest, purchasingService.updateOrderRequest);
    assert.equal(service.submitOrderRequest, purchasingService.submitOrderRequest);
    assert.equal(service.issuePurchaseOrder, purchasingService.issuePurchaseOrder);
    assert.equal(service.retiredInventoryApproval, purchasingService.retiredInventoryApproval);
  });

  it('delegates returns and RMA methods directly to returns-rma.service', () => {
    assert.equal(service.getLeftoverReturns, returnsRmaService.getLeftoverReturns);
    assert.equal(service.createLeftoverReturn, returnsRmaService.createLeftoverReturn);
    assert.equal(service.getRmaCases, returnsRmaService.getRmaCases);
    assert.equal(service.createRmaCase, returnsRmaService.createRmaCase);
    assert.equal(service.updateRmaCase, returnsRmaService.updateRmaCase);
    assert.equal(service.receiveRmaReplacement, returnsRmaService.receiveRmaReplacement);
    assert.equal(service.getReturnsSummary, returnsRmaService.getReturnsSummary);
  });

  it('delegates quarantine methods directly to quarantine.service', () => {
    assert.equal(service.getQuarantineItems, quarantineService.getQuarantineItems);
    assert.equal(service.createQuarantineItem, quarantineService.createQuarantineItem);
    assert.equal(service.disposeQuarantineItem, quarantineService.disposeQuarantineItem);
  });

  it('delegates dashboard methods directly to dashboard.service', () => {
    assert.equal(service.getDashboardData, dashboardService.getDashboardData);
    assert.equal(service.getActivityLog, dashboardService.getActivityLog);
  });

  it('re-exports shared domain utilities and transaction manager', () => {
    assert.equal(service.runInTransaction, shared.runInTransaction);
    assert.equal(service.serviceError, shared.serviceError);
    assert.equal(service.assertRole, shared.assertRole);
    assert.equal(service.actorName, shared.actorName);
    assert.equal(service.assertObjectId, shared.assertObjectId);
    assert.equal(service.pickFields, shared.pickFields);
    assert.equal(service.validHttpUrl, shared.validHttpUrl);
    assert.equal(service.generateReference, shared.generateReference);
    assert.equal(service.orderLookup, shared.orderLookup);
    assert.equal(service.authorizationLookup, shared.authorizationLookup);
    assert.equal(service.discrepancyLookup, shared.discrepancyLookup);
    assert.equal(service.normalizeInventoryData, shared.normalizeInventoryData);
    assert.equal(service.projectSerialNumbers, shared.projectSerialNumbers);
    assert.equal(service.validateCatalogData, shared.validateCatalogData);
    assert.equal(service.rejectProtectedStockFields, shared.rejectProtectedStockFields);
    assert.equal(service.MASTER_DATA_FIELDS, shared.MASTER_DATA_FIELDS);
    assert.equal(service.PROTECTED_STOCK_FIELDS, shared.PROTECTED_STOCK_FIELDS);
    assert.equal(service.TECHNICIAN_ROLES, shared.TECHNICIAN_ROLES);
  });
});
