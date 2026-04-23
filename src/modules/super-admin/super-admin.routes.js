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

// Dashboard summary metrics
// GET /api/super-admin/dashboard-summary
router.get("/dashboard-summary", controller.getDashboardSummary);

// Get user by ID
// GET /api/super-admin/users/:userId
router.get("/users/:userId", controller.getUser);

// Update user details
// PUT /api/super-admin/users/:userId
router.put("/users/:userId", controller.updateUser);

// Delete user (soft or hard delete)
// DELETE /api/super-admin/users/:userId?hardDelete=true
router.delete("/users/:userId", controller.deleteUser);

/**
 * User Deactivation & Reactivation Routes
 */

// Deactivate user
// PATCH /api/super-admin/users/:userId/deactivate
router.patch("/users/:userId/deactivate", controller.deactivateUser);

// Get pending reactivation requests
// GET /api/super-admin/reactivation-requests
router.get("/reactivation-requests", controller.getReactivationRequests);

// Handle reactivation request (approve/reject)
// PATCH /api/super-admin/reactivation-requests/:userId
router.patch("/reactivation-requests/:userId", controller.handleReactivationRequest);

module.exports = router;
