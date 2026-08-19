const Inspection = require('./inspectionTicket.model');
const { WORKFLOW_STATUS } = require('../../../constants/enums');
const logger = require('../../../utils/logger');

exports.getAllInspections = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    // Add status filter if provided and not "All"
    // By default we exclude workflow-level statuses such as Finance Approved
    // because inspections in 'Finance Approved' are pending assignment and
    // should appear in Team Management, not in the Inspections tab.
    if (status && status !== 'All') {
      query.status = status;
    }

    // Add search filter using MongoDB $or operator for multiple fields
    // This performs pattern matching at the database level before returning results
    if (search) {
      const searchLower = search.toLowerCase();
      query.$or = [
        { 'customerId.fullName': { $regex: searchLower, $options: 'i' } },
        { location: { $regex: searchLower, $options: 'i' } },
        { _id: searchLower }
      ];
    }

    logger.debug('Inspections query', query);

    // If no explicit status filter is provided, fetch all inspections and
    // remove Finance Approved items in-memory. This avoids edge-cases where
    // MongoDB regex operators might not filter legacy values as expected.
    let inspections;
    // Build a DB-level exclusion for 'Finance Approved' to catch legacy/odd encodings
    const financeApprovedRegex = /finance\W*approved/i;
    if (!status || status === 'All') {
      // Use $nor to explicitly exclude documents whose status matches the regex
      const dbQuery = { ...query, $nor: [{ status: financeApprovedRegex }] };
      logger.debug('Inspections DB query with finance exclusion', dbQuery);
      inspections = await Inspection.find(dbQuery)
        .populate('customerId', 'fullName address')
        .sort({ createdAt: -1 })
        .lean();
      logger.debug('Inspections fetched from DB (pre-filter):', { count: inspections.length });
    } else {
      // If caller asked for a specific status, respect it exactly
      inspections = await Inspection.find(query)
        .populate('customerId', 'fullName address')
        .sort({ createdAt: -1 })
        .lean();
    }

    // As a final safety measure, remove any inspections that are still in
    // 'Finance Approved' workflow state so they don't appear on the Inspections tab.
    const beforeFilterCount = inspections.length;
    inspections = inspections.filter((item) => {
      const statusStr = String(item.status || '').trim().toLowerCase();
      const isFinance = statusStr.includes('finance') && statusStr.includes('approved');
      if (isFinance) logger.warn('Filtering out finance-approved inspection', { id: String(item._id), rawStatus: item.status });
      return !isFinance;
    });
    logger.debug('Inspections count before/after in-memory filter', { before: beforeFilterCount, after: inspections.length });

    res.json({ success: true, count: inspections.length, data: inspections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.getInspectionById = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id)
      .populate('customerId', 'fullName email phoneNumber address')
      .lean();

    if (!inspection) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, data: inspection });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.updateInspectionStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // Validate required field
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required' });
    }

    // Update status and return new document
    const updated = await Inspection.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

