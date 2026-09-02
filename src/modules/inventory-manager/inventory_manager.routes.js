const router = require("express").Router();
const controller = require("./inventory_manager.controller");
const { protect } = require("../../middleware/protect");
const { authorize } = require("../../middleware/role.middleware");

router.use(protect);
router.use(authorize(["INVENTORY", "SUPER_ADMIN"]));

// Add routes here
// Dashboard data
router.get("/dashboard", controller.getDashboard);
// Inventory list
router.get("/list", controller.getInventory);
// Fixed warehouse and placement-area catalog
router.get("/locations", controller.getLocations);
// Single item
router.get("/item/:id", controller.getItem);
// Update item
router.put("/item/:id", controller.updateItem);
router.patch("/item/:id", controller.updateItem);
// Create item
router.post("/item", controller.createItem);
router.post("/receipts", controller.receiveInventory);
// Suppliers
router.get("/suppliers", controller.getSuppliers);
router.post("/suppliers", controller.createSupplier);
// Procurements
router.get("/procurements", controller.getProcurements);
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
router.get("/quarantine", controller.getQuarantineItems);
router.post("/quarantine", controller.createQuarantineItem);
router.patch("/quarantine/:id/dispose", controller.disposeQuarantineItem);

module.exports = router;
