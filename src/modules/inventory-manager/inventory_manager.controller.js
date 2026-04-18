const service = require("./inventory_manager.service");

exports.toString = (req, res) => {
  res.json({ message: "InventoryManager module placeholder" });
};
