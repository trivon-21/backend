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

module.exports = router;
