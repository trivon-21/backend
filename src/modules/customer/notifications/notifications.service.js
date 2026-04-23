const User = require("../../../models/User");

const NOTIFICATION_TYPES = new Set(["order", "inquiry", "service", "feedback", "general"]);

function mapNotification(n) {
  return {
    id: n._id,
    type: n.type,
    title: n.title,
    message: n.message,
    read: n.read,
    actionUrl: n.actionUrl || "",
    createdAt: n.createdAt
  };
}

exports.getNotifications = async (userId) => {
  const user = await User.findById(userId).select("notifications");
  if (!user) throw new Error("User not found");

  return [...(user.notifications || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(mapNotification);
};

exports.createNotification = async (userId, payload) => {
  const type = payload?.type;
  const title = payload?.title?.trim();
  const message = payload?.message?.trim();
  const actionUrl = payload?.actionUrl?.trim() || "";

  if (!NOTIFICATION_TYPES.has(type)) {
    throw new Error("Invalid notification type");
  }
  if (!title || !message) {
    throw new Error("title and message are required");
  }

  const user = await User.findById(userId).select("notifications");
  if (!user) throw new Error("User not found");

  user.notifications.unshift({
    type,
    title,
    message,
    actionUrl,
    read: false,
    createdAt: new Date()
  });

  // Keep only the most recent 200 notifications per user.
  if (user.notifications.length > 200) {
    user.notifications = user.notifications.slice(0, 200);
  }

  await user.save();
  return mapNotification(user.notifications[0]);
};

exports.markAsRead = async (userId, notificationId) => {
  const user = await User.findById(userId).select("notifications");
  if (!user) throw new Error("User not found");

  const target = user.notifications.id(notificationId);
  if (!target) throw new Error("Notification not found");

  target.read = true;
  await user.save();

  return mapNotification(target);
};

exports.markAllAsRead = async (userId) => {
  const user = await User.findById(userId).select("notifications");
  if (!user) throw new Error("User not found");

  user.notifications.forEach((n) => {
    n.read = true;
  });

  await user.save();
};

exports.deleteNotification = async (userId, notificationId) => {
  const user = await User.findById(userId).select("notifications");
  if (!user) throw new Error("User not found");

  const target = user.notifications.id(notificationId);
  if (!target) throw new Error("Notification not found");

  target.deleteOne();
  await user.save();
};

exports.clearNotifications = async (userId) => {
  const user = await User.findById(userId).select("notifications");
  if (!user) throw new Error("User not found");

  user.notifications = [];
  await user.save();
};

exports.getPreferences = async (userId) => {
  const user = await User.findById(userId).select("notificationPreferences");
  if (!user) throw new Error("User not found");

  return user.notificationPreferences;
};

exports.updatePreferences = async (userId, updates) => {
  const allowedKeys = [
    "orderUpdates",
    "inquiryResponses",
    "serviceRequests",
    "feedbackConfirmation",
    "emailNotifications",
    "pushNotifications"
  ];

  const updatePayload = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      updatePayload[`notificationPreferences.${key}`] = Boolean(updates[key]);
    }
  }

  await User.findByIdAndUpdate(userId, { $set: updatePayload });

  const updatedUser = await User.findById(userId).select("notificationPreferences");
  if (!updatedUser) throw new Error("User not found");
  return updatedUser.notificationPreferences;
};
