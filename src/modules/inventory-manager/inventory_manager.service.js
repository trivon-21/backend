/**
 * Inventory Manager Service Facade
 *
 * Decomposed into cohesive capability services (AR-02 / Epic 19):
 * - ./services/catalog.service.js
 * - ./services/procurement.service.js
 * - ./services/dispatch.service.js
 * - ./services/material-request.service.js
 * - ./services/asset-loan.service.js
 * - ./services/purchasing.service.js
 * - ./services/returns-rma.service.js
 * - ./services/quarantine.service.js
 * - ./services/dashboard.service.js
 * - ./services/shared.js
 *
 * This facade provides complete backward compatibility for all controllers, routes,
 * scripts, and unit/integration tests.
 */

const catalogService = require('./services/catalog.service');
const procurementService = require('./services/procurement.service');
const dispatchService = require('./services/dispatch.service');
const materialRequestService = require('./services/material-request.service');
const assetLoanService = require('./services/asset-loan.service');
const purchasingService = require('./services/purchasing.service');
const returnsRmaService = require('./services/returns-rma.service');
const quarantineService = require('./services/quarantine.service');
const dashboardService = require('./services/dashboard.service');
const stockAdjustmentService = require('./services/stock-adjustment.service');
const shared = require('./services/shared');

module.exports = {
  // ── Catalog & Master Data ──
  getInventoryList: catalogService.getInventoryList,
  getInventoryItem: catalogService.getInventoryItem,
  getInventoryLocations: catalogService.getInventoryLocations,
  updateInventoryItem: catalogService.updateInventoryItem,
  createInventoryItem: catalogService.createInventoryItem,
  deleteInventoryItem: catalogService.deleteInventoryItem,
  getSuppliersList: catalogService.getSuppliersList,
  createSupplier: catalogService.createSupplier,
  getSuggestedOrders: catalogService.getSuggestedOrders,

  // ── Stock Adjustments & Ledger ──
  adjustStock: stockAdjustmentService.adjustStock,
  getStockMovements: stockAdjustmentService.getStockMovements,
  getStockAdjustments: stockAdjustmentService.getStockAdjustments,

  // ── Receiving & Procurement ──
  createReceiptAuthorization: procurementService.createReceiptAuthorization,
  getReceiptAuthorizations: procurementService.getReceiptAuthorizations,
  receiveInventory: procurementService.receiveInventory,
  getRecentProcurements: procurementService.getRecentProcurements,
  getProcurementSummary: procurementService.getProcurementSummary,
  getReceiptDiscrepancies: procurementService.getReceiptDiscrepancies,

  // ── Dispatch & Orders ──
  getOrders: dispatchService.getOrders,
  updateOrder: dispatchService.updateOrder,

  // ── Material Requests ──
  getMaterialRequests: materialRequestService.getMaterialRequests,
  confirmMaterialItem: materialRequestService.confirmMaterialItem,
  reserveMaterialRequest: materialRequestService.reserveMaterialRequest,
  releaseMaterialRequest: materialRequestService.releaseMaterialRequest,
  handoverMaterialRequest: materialRequestService.handoverMaterialRequest,

  // ── Asset Loans & Tools ──
  getTechnicians: assetLoanService.getTechnicians,
  getAssetLoans: assetLoanService.getAssetLoans,
  getAvailableTools: assetLoanService.getAvailableTools,
  checkOutTool: assetLoanService.checkOutTool,
  returnTool: assetLoanService.returnTool,
  getAssetReturnLogs: assetLoanService.getAssetReturnLogs,

  // ── Purchasing & Order Requests ──
  getOrderRequests: purchasingService.getOrderRequests,
  createOrderRequest: purchasingService.createOrderRequest,
  updateOrderRequest: purchasingService.updateOrderRequest,
  submitOrderRequest: purchasingService.submitOrderRequest,
  issuePurchaseOrder: purchasingService.issuePurchaseOrder,
  retiredInventoryApproval: purchasingService.retiredInventoryApproval,

  // ── Returns & RMA ──
  getLeftoverReturns: returnsRmaService.getLeftoverReturns,
  createLeftoverReturn: returnsRmaService.createLeftoverReturn,
  getRmaCases: returnsRmaService.getRmaCases,
  createRmaCase: returnsRmaService.createRmaCase,
  updateRmaCase: returnsRmaService.updateRmaCase,
  receiveRmaReplacement: returnsRmaService.receiveRmaReplacement,
  getReturnsSummary: returnsRmaService.getReturnsSummary,

  // ── Quarantine ──
  getQuarantineItems: quarantineService.getQuarantineItems,
  createQuarantineItem: quarantineService.createQuarantineItem,
  disposeQuarantineItem: quarantineService.disposeQuarantineItem,

  // ── Dashboard & Activity ──
  getDashboardData: dashboardService.getDashboardData,
  getActivityLog: dashboardService.getActivityLog,

  // ── Shared Domain Helpers & Transaction Manager ──
  runInTransaction: shared.runInTransaction,
  serviceError: shared.serviceError,
  assertRole: shared.assertRole,
  actorName: shared.actorName,
  assertObjectId: shared.assertObjectId,
  pickFields: shared.pickFields,
  validHttpUrl: shared.validHttpUrl,
  generateReference: shared.generateReference,
  orderLookup: shared.orderLookup,
  authorizationLookup: shared.authorizationLookup,
  discrepancyLookup: shared.discrepancyLookup,
  normalizeInventoryData: shared.normalizeInventoryData,
  projectSerialNumbers: shared.projectSerialNumbers,
  validateCatalogData: shared.validateCatalogData,
  rejectProtectedStockFields: shared.rejectProtectedStockFields,
  MASTER_DATA_FIELDS: shared.MASTER_DATA_FIELDS,
  PROTECTED_STOCK_FIELDS: shared.PROTECTED_STOCK_FIELDS,
  TECHNICIAN_ROLES: shared.TECHNICIAN_ROLES,
};
