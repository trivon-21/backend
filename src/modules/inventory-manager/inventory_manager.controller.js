const service = require("./inventory_manager.service");

/**
 * Handles dashboard data retrieval.
 * Returns an offline state if the service fails, ensuring the UI remains stable.
 */
exports.getDashboard = async (req, res) => {
  try {
    const data = await service.getDashboardData(req.user);
    res.json(data);
  } catch (error) {
    console.error('Dashboard fetch error:', error);
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

/**
 * Retrieves the full inventory list.
 */
exports.getInventory = async (req, res) => {
  try {
    const data = await service.getInventoryList();
    res.json(data);
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ message: "Failed to fetch inventory data" });
  }
};

/**
 * Retrieves details for a specific inventory item.
 */
exports.getItem = async (req, res) => {
  try {
    const data = await service.getInventoryItem(req.params.id);
    if (!data) return res.status(404).json({ message: "Item not found" });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch item" });
  }
};

/**
 * Updates a specific inventory item.
 */
exports.updateItem = async (req, res) => {
  try {
    const data = await service.updateInventoryItem(req.params.id, req.body);
    if (!data) return res.status(404).json({ message: "Item not found", code: "ITEM_NOT_FOUND" });
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to update item", code: error.code });
  }
};

/**
 * Creates a new inventory item.
 */
exports.createItem = async (req, res) => {
  try {
    const data = await service.createInventoryItem(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('Item creation error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "SKU already exists", code: "DUPLICATE_SKU" });
    }
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to create item", code: error.code });
  }
};

/**
 * Receives stock into an existing SKU or creates and receives a new item.
 */
exports.receiveInventory = async (req, res) => {
  try {
    const data = await service.receiveInventory(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('Inventory receipt error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to receive inventory',
      code: error.code || 'RECEIPT_FAILED'
    });
  }
};

/**
 * Retrieves recent procurement records.
 */
exports.getProcurements = async (req, res) => {
  try {
    const data = await service.getRecentProcurements();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch procurements" });
  }
};

/**
 * Retrieves all registered suppliers.
 */
exports.getSuppliers = async (req, res) => {
  try {
    const data = await service.getSuppliersList();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch suppliers" });
  }
};

/**
 * Registers a new supplier.
 */
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

/**
 * Retrieves all logistics orders.
 */
exports.getOrders = async (req, res) => {
  try {
    const data = await service.getOrders();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

/**
 * Updates a specific logistics order.
 */
exports.updateOrder = async (req, res) => {
  try {
    const data = await service.updateOrder(req.params.id, req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to update order" });
  }
};

/**
 * Retrieves all material requests.
 */
exports.getMaterialRequests = async (req, res) => {
  try {
    const data = await service.getMaterialRequests();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch material requests" });
  }
};

/**
 * Updates a specific material request.
 */
exports.updateMaterialRequest = async (req, res) => {
  try {
    const data = await service.updateMaterialRequest(req.params.id, req.body);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to update material request" });
  }
};

/**
 * Retrieves a list of available technicians.
 */
exports.getTechnicians = async (req, res) => {
  try {
    const data = await service.getTechnicians();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch technicians" });
  }
};

/**
 * Retrieves all current asset loans.
 */
exports.getAssetLoans = async (req, res) => {
  try {
    const data = await service.getAssetLoans();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch asset loans" });
  }
};

exports.getAvailableTools = async (req, res) => {
  try {
    const data = await service.getAvailableTools();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch available tools' });
  }
};

/**
 * Processes a tool checkout request.
 */
exports.checkOutTool = async (req, res) => {
  try {
    const data = await service.checkOutTool(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to check out tool' });
  }
};

/**
 * Processes a tool return request.
 */
exports.returnTool = async (req, res) => {
  try {
    const data = await service.returnTool(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to return tool" });
  }
};

/**
 * Retrieves all historical asset return logs.
 */
exports.getAssetReturnLogs = async (req, res) => {
  try {
    const data = await service.getAssetReturnLogs();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch return logs" });
  }
};

// ── Order Creation Endpoints ──

/**
 * Retrieves all purchase order requests.
 */
exports.getOrderRequests = async (req, res) => {
  try {
    const data = await service.getOrderRequests(req.user);
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to fetch order requests", code: error.code });
  }
};

/**
 * Creates a new purchase order request.
 */
exports.createOrderRequest = async (req, res) => {
  try {
    const data = await service.createOrderRequest(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('Order request creation error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to create order request", code: error.code });
  }
};

/**
 * Updates a specific purchase order request.
 */
exports.updateOrderRequest = async (req, res) => {
  try {
    const data = await service.updateOrderRequest(req.params.id, req.body, req.user);
    res.json(data);
  } catch (error) {
    console.error('Order request update error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to update order request", code: error.code });
  }
};

exports.submitOrderRequest = async (req, res) => {
  try {
    res.json(await service.submitOrderRequest(req.params.id, req.user));
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message, code: error.code });
  }
};

exports.issuePurchaseOrder = async (req, res) => {
  try {
    res.json(await service.issuePurchaseOrder(req.params.id, req.user));
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message, code: error.code });
  }
};

exports.createReceiptAuthorization = async (req, res) => {
  try {
    res.status(201).json(await service.createReceiptAuthorization(req.body, req.user));
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message, code: error.code });
  }
};

exports.getReceiptAuthorizations = async (req, res) => {
  try {
    res.json(await service.getReceiptAuthorizations(req.query, req.user));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message, code: error.code });
  }
};

/**
 * Approves a purchase order request.
 */
exports.approveOrderRequest = async (req, res) => {
  try {
    service.retiredInventoryApproval();
  } catch (error) {
    console.error('Order approval error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to approve order request", code: error.code });
  }
};

/**
 * Rejects a purchase order request.
 */
exports.rejectOrderRequest = async (req, res) => {
  try {
    service.retiredInventoryApproval();
  } catch (error) {
    console.error('Order rejection error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to reject order request", code: error.code });
  }
};

/**
 * Retrieves suggested purchase orders based on low stock levels.
 */
exports.getSuggestedOrders = async (req, res) => {
  try {
    const data = await service.getSuggestedOrders();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch suggested orders" });
  }
};

/**
 * Retrieves the full activity log.
 */
exports.getActivityLog = async (req, res) => {
  try {
    const data = await service.getActivityLog();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch activity log" });
  }
};

// ── Returns & RMA Endpoints ──

/**
 * Retrieves all leftover return records.
 */
exports.getLeftoverReturns = async (req, res) => {
  try {
    const data = await service.getLeftoverReturns();
    res.json(data);
  } catch (error) {
    console.error('Leftover returns fetch error:', error);
    res.status(500).json({ message: "Failed to fetch leftover returns" });
  }
};

/**
 * Creates a new leftover return and handles stock/quarantine logic.
 */
exports.createLeftoverReturn = async (req, res) => {
  try {
    const data = await service.createLeftoverReturn(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('Leftover return creation error:', error);
    res.status(500).json({ message: error.message || "Failed to create leftover return" });
  }
};

/**
 * Retrieves all RMA cases.
 */
exports.getRmaCases = async (req, res) => {
  try {
    const data = await service.getRmaCases();
    res.json(data);
  } catch (error) {
    console.error('RMA cases fetch error:', error);
    res.status(500).json({ message: "Failed to fetch RMA cases" });
  }
};

/**
 * Creates a new RMA case.
 */
exports.createRmaCase = async (req, res) => {
  try {
    const data = await service.createRmaCase(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('RMA case creation error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to create RMA case", code: error.code });
  }
};

/**
 * Updates an RMA case status.
 */
exports.updateRmaCase = async (req, res) => {
  try {
    const data = await service.updateRmaCase(req.params.id, req.body);
    res.json(data);
  } catch (error) {
    console.error('RMA case update error:', error);
    res.status(400).json({ message: error.message || "Failed to update RMA case" });
  }
};

/**
 * Retrieves all active quarantine items.
 */
exports.getQuarantineItems = async (req, res) => {
  try {
    const data = await service.getQuarantineItems();
    res.json(data);
  } catch (error) {
    console.error('Quarantine items fetch error:', error);
    res.status(500).json({ message: "Failed to fetch quarantine items" });
  }
};

/**
 * Manually adds an item to the quarantine zone.
 */
exports.createQuarantineItem = async (req, res) => {
  try {
    const data = await service.createQuarantineItem(req.body, req.user);
    res.status(201).json(data);
  } catch (error) {
    console.error('Quarantine item creation error:', error);
    res.status(500).json({ message: error.message || "Failed to create quarantine item" });
  }
};

/**
 * Disposes a quarantine item.
 */
exports.disposeQuarantineItem = async (req, res) => {
  try {
    const data = await service.disposeQuarantineItem(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    console.error('Quarantine dispose error:', error);
    res.status(400).json({ message: error.message || "Failed to dispose quarantine item" });
  }
};

/**
 * Retrieves aggregated returns summary stats.
 */
exports.getReturnsSummary = async (req, res) => {
  try {
    const data = await service.getReturnsSummary();
    res.json(data);
  } catch (error) {
    console.error('Returns summary fetch error:', error);
    res.status(500).json({ message: "Failed to fetch returns summary" });
  }
};
