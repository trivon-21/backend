// src/controllers/serviceReport.controller.js
const ServiceReport = require('./technician.model');

// 1. GET all reports for the table view
exports.getAllServiceReports = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query = {
        $or: [
          { 'customer.name': searchRegex },
          { 'location': searchRegex },
          { 'productDetails.detailedType': searchRegex }
        ]
      };
    }

    const reports = await ServiceReport.find(query)
      .sort({ submittedAt: -1 })
      .lean();

    res.json({ success: true, count: reports.length, data: reports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 2. GET detailed report for review/view
exports.getServiceReportById = async (req, res) => {
  try {
    const report = await ServiceReport.findById(req.params.id).lean();
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};