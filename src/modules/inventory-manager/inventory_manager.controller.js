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
    res.status(503).json({
      code: 'INVENTORY_DASHBOARD_UNAVAILABLE',
      message: 'Inventory dashboard is currently unavailable',
    });
  }
};

/**
 * Retrieves the inventory list.
 * Supports optional server-side pagination, search, and filtering via query params:
 *   ?page=&pageSize=&search=&itemClass=&subcategory=&supplierId=&sortField=&sortDirection=
 * When no query params are present the full flat array is returned (backward compatible).
 */
exports.getInventory = async (req, res) => {
  try {
    const params = Object.keys(req.query).length ? req.query : undefined;
    const data = await service.getInventoryList(params);
    res.json(data);
  } catch (error) {
    console.error('Inventory fetch error:', error);
    res.status(500).json({ message: "Failed to fetch inventory data" });
  }
};

exports.getLocations = (req, res) => {
  res.json(service.getInventoryLocations());
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
    const status = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
    res.status(status).json({ message: error.message || "Failed to update item", code: error.code });
  }
};

/**
 * Deletes an inventory item that carries no stock.
 */
exports.deleteItem = async (req, res) => {
  try {
    const data = await service.deleteInventoryItem(req.params.id);
    if (!data) return res.status(404).json({ message: "Item not found", code: "ITEM_NOT_FOUND" });
    res.json({ message: "Item deleted", id: req.params.id });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to delete item", code: error.code });
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
    // Translate Mongoose and domain errors to deterministic stable codes (IM-010).
    if (error.statusCode) {
      if (error.statusCode >= 500) console.error('Inventory receipt error:', error);
      return res.status(error.statusCode).json({ message: error.message, code: error.code || 'RECEIPT_FAILED' });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid ID format in receipt request', code: 'INVALID_OBJECT_ID' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Invalid receipt input', code: 'INVALID_RECEIPT_CONDITION' });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Serial number already exists in the registry', code: 'DUPLICATE_SERIAL' });
    }
    console.error('Inventory receipt unexpected error:', error);
    res.status(500).json({ message: 'Failed to receive inventory', code: 'RECEIPT_FAILED' });
  }
};

/**
 * Establishes or corrects an item's on-hand quantity through the audited
 * stock-adjustment workflow (opening balance, cycle-count variance, write-off).
 */
exports.adjustStock = async (req, res) => {
  try {
    const data = await service.adjustStock({ ...req.body, inventoryId: req.params.id }, req.user);
    res.status(201).json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to adjust stock', code: error.code, details: error.details });
  }
};

/**
 * Retrieves the stock-movement ledger for a single item.
 */
exports.getItemStockMovements = async (req, res) => {
  try {
    const data = await service.getStockMovements({ inventoryId: req.params.id, limit: req.query.limit });
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch stock movements', code: error.code });
  }
};

/**
 * Retrieves the manual adjustment/write-off history across all items.
 */
exports.getStockAdjustments = async (req, res) => {
  try {
    const data = await service.getStockAdjustments({ inventoryId: req.query.inventoryId, limit: req.query.limit });
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch stock adjustments', code: error.code });
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
 * Everything the procurement page needs, in one response.
 */
exports.getProcurementSummary = async (req, res) => {
  try {
    const data = await service.getProcurementSummary(req.user);
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      code: error.code || 'PROCUREMENT_SUMMARY_FAILED',
      message: error.message || 'Failed to fetch procurement data',
    });
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
      return res.status(409).json({ message: "Supplier already exists", code: "DUPLICATE_SUPPLIER" });
    }
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to create supplier", code: error.code });
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
    const data = await service.updateOrder(req.params.id, req.body, req.user);
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || (error.name === 'ValidationError' ? 400 : 500)).json({ message: error.message || "Failed to update order", code: error.code });
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

exports.getReceiptDiscrepancies = async (req, res) => {
  try {
    const data = await service.getReceiptDiscrepancies({ status: req.query.status });
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch receipt discrepancies',
      code: error.code,
    });
  }
};

exports.confirmMaterialItem = async (req, res) => {
  try {
    res.json(await service.confirmMaterialItem(req.params.id, req.params.lineId, req.body, req.user));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message, code: error.code, details: error.details });
  }
};

exports.reserveMaterialRequest = async (req, res) => {
  try {
    res.json(await service.reserveMaterialRequest(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message, code: error.code, details: error.details });
  }
};

exports.releaseMaterialRequest = async (req, res) => {
  try {
    res.json(await service.releaseMaterialRequest(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message, code: error.code, details: error.details });
  }
};

exports.handoverMaterialRequest = async (req, res) => {
  try {
    res.json(await service.handoverMaterialRequest(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message, code: error.code, details: error.details });
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
    const data = await service.checkOutTool(req.body, req.user);
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
    const data = await service.returnTool(req.params.id, req.user, req.body);
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to return tool", code: error.code });
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
    const duplicateShortage = error?.code === 11000 && error?.keyPattern?.activeShortageKey;
    res.status(duplicateShortage ? 409 : (error.statusCode || 500)).json({
      message: duplicateShortage ? 'An active shortage order already exists for this supplier' : (error.message || 'Failed to create order request'),
      code: duplicateShortage ? 'DUPLICATE_SHORTAGE_ORDER' : error.code,
    });
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
    res.json(await service.submitOrderRequest(req.params.id, req.body || {}, req.user));
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message, code: error.code });
  }
};

exports.issuePurchaseOrder = async (req, res) => {
  try {
    res.json(await service.issuePurchaseOrder(req.params.id, req.body || {}, req.user));
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
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to create leftover return", code: error.code });
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
    const data = await service.updateRmaCase(req.params.id, req.body, req.user);
    res.json(data);
  } catch (error) {
    console.error('RMA case update error:', error);
    res.status(error.statusCode || 400).json({ message: error.message || "Failed to update RMA case", code: error.code });
  }
};

/**
 * Receives a supplier replacement for an RMA case.
 */
exports.receiveRmaReplacement = async (req, res) => {
  try {
    const data = await service.receiveRmaReplacement(req.params.id, req.body, req.user);
    res.json(data);
  } catch (error) {
    console.error('RMA replacement error:', error);
    res.status(error.statusCode || 400).json({ message: error.message || "Failed to receive RMA replacement", code: error.code });
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
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to create quarantine item", code: error.code });
  }
};

/**
 * Disposes a quarantine item — permanently removes it from the system.
 */
exports.disposeQuarantineItem = async (req, res) => {
  try {
    const data = await service.disposeQuarantineItem(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    if ((error.statusCode || 500) >= 500) {
      console.error('Quarantine dispose error:', error);
    }
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to dispose quarantine item", code: error.code });
  }
};

/**
 * Returns a quarantine item's stock back to inventory and removes it from quarantine.
 */
exports.deleteQuarantineItem = async (req, res) => {
  try {
    const data = await service.deleteQuarantineItem(req.params.id, req.user);
    res.json(data);
  } catch (error) {
    if ((error.statusCode || 500) >= 500) {
      console.error('Quarantine delete error:', error);
    }
    res.status(error.statusCode || 500).json({ message: error.message || "Failed to delete quarantine item", code: error.code });
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
