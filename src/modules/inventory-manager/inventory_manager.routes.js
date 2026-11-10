const router = require("express").Router();
const controller = require("./inventory_manager.controller");
const { protect } = require("../../middleware/protect");
const { authorize } = require("../../middleware/role.middleware");

router.use(protect);

// Inventory catalog read routes (accessible to INVENTORY, SUPER_ADMIN, and MANAGER)
router.get("/list", authorize(["INVENTORY", "SUPER_ADMIN", "MANAGER"]), controller.getInventory);
router.get("/locations", authorize(["INVENTORY", "SUPER_ADMIN", "MANAGER"]), controller.getLocations);
router.get("/item/:id", authorize(["INVENTORY", "SUPER_ADMIN", "MANAGER"]), controller.getItem);

// Operational, dashboard, and mutating routes restricted to INVENTORY and SUPER_ADMIN
router.use(authorize(["INVENTORY", "SUPER_ADMIN"]));

// Dashboard data
router.get("/dashboard", controller.getDashboard);
// Update item
router.put("/item/:id", controller.updateItem);
router.patch("/item/:id", controller.updateItem);
// Create item
router.post("/item", controller.createItem);
// Delete item (only when it carries no stock)
router.delete("/item/:id", controller.deleteItem);
router.post("/receipts", controller.receiveInventory);
// Stock Adjustments & Ledger
router.post("/item/:id/stock-adjustments", controller.adjustStock);
router.get("/item/:id/stock-movements", controller.getItemStockMovements);
router.get("/stock-adjustments", controller.getStockAdjustments);
// Suppliers
router.get("/suppliers", controller.getSuppliers);
router.post("/suppliers", controller.createSupplier);
// Procurements
router.get("/procurement/summary", controller.getProcurementSummary);
router.get("/procurements", controller.getProcurements);
router.get("/receipt-discrepancies", controller.getReceiptDiscrepancies);
router.get("/receipt-authorizations", controller.getReceiptAuthorizations);
router.post("/receipt-authorizations", controller.createReceiptAuthorization);

// Orders (Dispatch & Logistics)
router.get("/orders", controller.getOrders);
router.patch("/orders/:id", controller.updateOrder);

// Material Requests
router.get("/material-requests", controller.getMaterialRequests);
router.patch("/material-requests/:id/items/:lineId", controller.confirmMaterialItem);
router.post("/material-requests/:id/reserve", controller.reserveMaterialRequest);
router.post("/material-requests/:id/release", controller.releaseMaterialRequest);
router.post("/material-requests/:id/handover", controller.handoverMaterialRequest);

// Asset Management
router.get("/technicians", controller.getTechnicians);
router.get("/asset-loans", controller.getAssetLoans);
router.get("/available-tools", controller.getAvailableTools);
router.post("/asset-loans", controller.checkOutTool);
router.post("/asset-loans/return/:id", controller.returnTool);
router.get("/asset-return-logs", controller.getAssetReturnLogs);

// Order Creation
router.get("/order-requests", controller.getOrderRequests);
router.post("/order-requests", controller.createOrderRequest);
router.patch("/order-requests/:id", controller.updateOrderRequest);
router.post("/order-requests/:id/submit", controller.submitOrderRequest);
router.post("/order-requests/:id/issue-po", controller.issuePurchaseOrder);
router.patch("/order-requests/:id/approve", controller.approveOrderRequest);
router.patch("/order-requests/:id/reject", controller.rejectOrderRequest);
router.get("/suggested-orders", controller.getSuggestedOrders);
router.get("/activity", controller.getActivityLog);

// Returns & RMA
router.get("/returns-summary", controller.getReturnsSummary);
router.get("/leftover-returns", controller.getLeftoverReturns);
router.post("/leftover-returns", controller.createLeftoverReturn);
router.get("/rma-cases", controller.getRmaCases);
router.post("/rma-cases", controller.createRmaCase);
router.patch("/rma-cases/:id", controller.updateRmaCase);
router.post("/rma-cases/:id/replacement", controller.receiveRmaReplacement);
router.get("/quarantine", controller.getQuarantineItems);
router.post("/quarantine", controller.createQuarantineItem);
router.patch("/quarantine/:id/dispose", controller.disposeQuarantineItem);
router.delete("/quarantine/:id", controller.deleteQuarantineItem);

module.exports = router;
