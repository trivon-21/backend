const router = require("express").Router();
const controller = require("./inventory_manager.controller");
const { protect } = require("../../middleware/protect");

// Add routes here
// Dashboard data
router.get("/dashboard", protect, controller.getDashboard);
// Inventory list
router.get("/list", protect, controller.getInventory);
// Single item
router.get("/item/:id", protect, controller.getItem);
// Update item
router.put("/item/:id", protect, controller.updateItem);
router.patch("/item/:id", protect, controller.updateItem);
// Create item
router.post("/item", protect, controller.createItem);
router.post("/receipts", protect, controller.receiveInventory);
// Suppliers
router.get("/suppliers", protect, controller.getSuppliers);
router.post("/suppliers", protect, controller.createSupplier);
// Procurements
router.get("/procurements", protect, controller.getProcurements);
router.get("/receipt-authorizations", protect, controller.getReceiptAuthorizations);
router.post("/receipt-authorizations", protect, controller.createReceiptAuthorization);

// Orders (Dispatch & Logistics)
router.get("/orders", protect, controller.getOrders);
router.patch("/orders/:id", protect, controller.updateOrder);

// Material Requests
router.get("/material-requests", protect, controller.getMaterialRequests);
router.patch("/material-requests/:id", protect, controller.updateMaterialRequest);

// Asset Management
router.get("/technicians", protect, controller.getTechnicians);
router.get("/asset-loans", protect, controller.getAssetLoans);
router.get("/available-tools", protect, controller.getAvailableTools);
router.post("/asset-loans", protect, controller.checkOutTool);
router.post("/asset-loans/return/:id", protect, controller.returnTool);
router.get("/asset-return-logs", protect, controller.getAssetReturnLogs);

// Order Creation
router.get("/order-requests", protect, controller.getOrderRequests);
router.post("/order-requests", protect, controller.createOrderRequest);
router.patch("/order-requests/:id", protect, controller.updateOrderRequest);
router.post("/order-requests/:id/submit", protect, controller.submitOrderRequest);
router.post("/order-requests/:id/issue-po", protect, controller.issuePurchaseOrder);
router.patch("/order-requests/:id/approve", protect, controller.approveOrderRequest);
router.patch("/order-requests/:id/reject", protect, controller.rejectOrderRequest);
router.get("/suggested-orders", protect, controller.getSuggestedOrders);
router.get("/activity", protect, controller.getActivityLog);

// Returns & RMA
router.get("/returns-summary", protect, controller.getReturnsSummary);
router.get("/leftover-returns", protect, controller.getLeftoverReturns);
router.post("/leftover-returns", protect, controller.createLeftoverReturn);
router.get("/rma-cases", protect, controller.getRmaCases);
router.post("/rma-cases", protect, controller.createRmaCase);
router.patch("/rma-cases/:id", protect, controller.updateRmaCase);
router.get("/quarantine", protect, controller.getQuarantineItems);
router.post("/quarantine", protect, controller.createQuarantineItem);
router.patch("/quarantine/:id/dispose", protect, controller.disposeQuarantineItem);

module.exports = router;
