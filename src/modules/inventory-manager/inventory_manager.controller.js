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
