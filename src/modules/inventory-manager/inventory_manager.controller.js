const service = require("./inventory_manager.service");

exports.getDashboard = async (req, res) => {
  try {
    const data = await service.getDashboardData(req.user);
    res.json(data);
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    res.status(500).json({ message: "Failed to fetch dashboard data" });
  }
};

exports.getInventory = async (req, res) => {
  try {
    const data = await service.getInventoryList();
    res.json(data);
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ message: "Failed to fetch inventory data" });
  }
};

exports.getItem = async (req, res) => {
  try {
    const data = await service.getInventoryItem(req.params.id);
    if (!data) return res.status(404).json({ message: "Item not found" });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch item" });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const data = await service.updateInventoryItem(req.params.id, req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to update item" });
  }
};
