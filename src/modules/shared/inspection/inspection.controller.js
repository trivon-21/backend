const Inspection = require('./Inspection');

exports.getAllInspections = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    // Add status filter if provided and not "All"
    if (status && status !== 'All') {
      query.status = status;
    }

    // Add search filter using MongoDB $or operator for multiple fields
    // This performs pattern matching at the database level before returning results
    if (search) {
      const searchLower = search.toLowerCase();
      query.$or = [
        { 'customerId.name': { $regex: searchLower, $options: 'i' } },
        { location: { $regex: searchLower, $options: 'i' } },
        { _id: searchLower }
      ];
    }

    const inspections = await Inspection.find(query)
      .populate('customerId', 'name address') 
      .populate('assignedTeam', 'teamName')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: inspections.length, data: inspections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.getInspectionById = async (req, res) => {
  try {
    const inspection = await Inspection.findById(req.params.id)
      .populate('customerId', 'name email contactNo address')
      .populate('assignedTeam')
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