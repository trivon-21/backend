const service = require("./inventory_manager.service");

exports.getDashboard = async (req, res) => {
  try {
    const data = await service.getDashboardData(req.user);
    res.json(data);
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    // Return a partial "Offline" state instead of failing, so the dashboard shell still renders
    res.json({
      managerName: req.user?.fullName?.split(' ')[0] || 'Manager',
      currentDate: new Date(),
      status: 'Offline',
      stats: {
        materialReservations: { total: 0, subStats: [] },
        dispatchQueue: { total: 0, subStats: [] },
        assetHealth: { total: 0, subStats: [] },
        stockAlerts: { total: 0, subStats: [] }
      },
      recentActivity: [],
      reorderList: [],
      logistics: []
    });
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

exports.createItem = async (req, res) => {
  try {
    const data = await service.createInventoryItem(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('Item creation error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "SKU already exists" });
    }
    res.status(500).json({ message: "Failed to create item" });
  }
};

exports.getProcurements = async (req, res) => {
  try {
    const data = await service.getRecentProcurements();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch procurements" });
  }
};

exports.getSuppliers = async (req, res) => {
  try {
    const data = await service.getSuppliersList();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch suppliers" });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const data = await service.createSupplier(req.body.name);
    res.status(201).json(data);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Supplier already exists" });
    }
    res.status(500).json({ message: "Failed to create supplier" });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const data = await service.getOrders();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const data = await service.updateOrder(req.params.id, req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to update order" });
  }
};

exports.getMaterialRequests = async (req, res) => {
  try {
    const data = await service.getMaterialRequests();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch material requests" });
  }
};

exports.updateMaterialRequest = async (req, res) => {
  try {
    const data = await service.updateMaterialRequest(req.params.id, req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to update material request" });
  }
};

exports.getTechnicians = async (req, res) => {
  try {
    const data = await service.getTechnicians();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch technicians" });
  }
};

exports.getAssetLoans = async (req, res) => {
  try {
    const data = await service.getAssetLoans();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch asset loans" });
  }
};

exports.checkOutTool = async (req, res) => {
  try {
    const data = await service.checkOutTool(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to check out tool" });
  }
};

exports.returnTool = async (req, res) => {
  try {
    const data = await service.returnTool(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to return tool" });
  }
};

exports.getAssetReturnLogs = async (req, res) => {
  try {
    const data = await service.getAssetReturnLogs();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch return logs" });
  }
};

// ── Order Creation Endpoints ──

exports.getOrderRequests = async (req, res) => {
  try {
    const data = await service.getOrderRequests();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch order requests" });
  }
};

exports.createOrderRequest = async (req, res) => {
  try {
    const data = await service.createOrderRequest(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('Order request creation error:', error);
    res.status(500).json({ message: "Failed to create order request" });
  }
};

exports.approveOrderRequest = async (req, res) => {
  try {
    const data = await service.approveOrderRequest(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    console.error('Order approval error:', error);
    res.status(500).json({ message: error.message || "Failed to approve order request" });
  }
};

exports.rejectOrderRequest = async (req, res) => {
  try {
    const data = await service.rejectOrderRequest(req.params.id, req.body.reason, req.user);
    res.json(data);
  } catch (error) {
    console.error('Order rejection error:', error);
    res.status(500).json({ message: error.message || "Failed to reject order request" });
  }
};

exports.getSuggestedOrders = async (req, res) => {
  try {
    const data = await service.getSuggestedOrders();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch suggested orders" });
  }
};
