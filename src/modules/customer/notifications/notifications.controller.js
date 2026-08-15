const service = require("./notifications.service");

exports.getNotifications = async (req, res) => {
  try {
    const data = await service.getNotifications(req.user._id);
    return res.json({ data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.createNotification = async (req, res) => {
  try {
    const data = await service.createNotification(req.user._id, req.body || {});
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const data = await service.markAsRead(req.user._id, req.params.id);
    return res.json({ data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await service.markAllAsRead(req.user._id);
    return res.json({ message: "All notifications marked as read" });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    await service.deleteNotification(req.user._id, req.params.id);
    return res.json({ message: "Notification deleted" });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.clearNotifications = async (req, res) => {
  try {
    await service.clearNotifications(req.user._id);
    return res.json({ message: "Notifications cleared" });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const data = await service.getPreferences(req.user._id);
    return res.json({ data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const data = await service.updatePreferences(req.user._id, req.body || {});
    return res.json({ data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
