const router = require("express").Router();
const controller = require("./super-admin.controller");
const { protect } = require("../../middleware/protect");
const { authorize } = require("../../middleware/role.middleware");

// All super-admin routes require authentication and SUPER_ADMIN role
router.use(protect);
router.use(authorize(["SUPER_ADMIN"]));

/**
 * User Management Routes
 */

// Create new user
// POST /api/super-admin/users
router.post("/users", controller.createUser);

// List all users with pagination, filters, and search
// GET /api/super-admin/users
router.get("/users", controller.listUsers);

// Get user by ID
// GET /api/super-admin/users/:userId
router.get("/users/:userId", controller.getUser);

// Update user details
// PUT /api/super-admin/users/:userId
router.put("/users/:userId", controller.updateUser);

// Delete user (soft or hard delete)
// DELETE /api/super-admin/users/:userId?hardDelete=true
router.delete("/users/:userId", controller.deleteUser);

module.exports = router;
