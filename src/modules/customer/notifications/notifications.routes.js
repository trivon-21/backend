const router = require("express").Router();
const controller = require("./notifications.controller");

router.get("/", controller.getNotifications);
router.post("/", controller.createNotification);
router.patch("/read-all", controller.markAllAsRead);
router.patch("/:id/read", controller.markAsRead);
router.delete("/", controller.clearNotifications);
router.delete("/:id", controller.deleteNotification);

router.get("/preferences", controller.getNotificationPreferences);
router.put("/preferences", controller.updateNotificationPreferences);

module.exports = router;
