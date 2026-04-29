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
// Create item
router.post("/item", protect, controller.createItem);
// Suppliers
router.get("/suppliers", protect, controller.getSuppliers);
router.post("/suppliers", protect, controller.createSupplier);
// Procurements
router.get("/procurements", protect, controller.getProcurements);

// Orders (Dispatch & Logistics)
router.get("/orders", protect, controller.getOrders);
router.patch("/orders/:id", protect, controller.updateOrder);

// Material Requests
router.get("/material-requests", protect, controller.getMaterialRequests);
router.patch("/material-requests/:id", protect, controller.updateMaterialRequest);

// Asset Management
router.get("/technicians", protect, controller.getTechnicians);
router.get("/asset-loans", protect, controller.getAssetLoans);
router.post("/asset-loans", protect, controller.checkOutTool);
router.post("/asset-loans/return/:id", protect, controller.returnTool);
router.get("/asset-return-logs", protect, controller.getAssetReturnLogs);

// Order Creation
router.get("/order-requests", protect, controller.getOrderRequests);
router.post("/order-requests", protect, controller.createOrderRequest);
router.patch("/order-requests/:id", protect, controller.updateOrderRequest);
router.patch("/order-requests/:id/approve", protect, controller.approveOrderRequest);
router.patch("/order-requests/:id/reject", protect, controller.rejectOrderRequest);
router.get("/suggested-orders", protect, controller.getSuggestedOrders);

module.exports = router;
