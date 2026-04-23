// src/controllers/inspectionReport.controller.js
const InspectionReport = require('./inspection.model');
const Installation = require('../shared/installation/Installation');

// 1. GET all reports with populated Customer details
exports.getAllReports = async (req, res) => {
  try {
    const reports = await InspectionReport.find()
      .populate('customerId', 'name address contactNo')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ success: true, data: reports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 2. GET single report by MongoDB ID
exports.getReportById = async (req, res) => {
  try {
    const report = await InspectionReport.findById(req.params.id)
      .populate('customerId')
      .lean();

    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 3. UPDATE Requirements (Reviewed Status)
exports.updateRequirements = async (req, res) => {
  try {
    const report = await InspectionReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    if (!req.body.requirements) {
      return res.status(400).json({ success: false, message: 'Requirements payload is required' });
    }

    report.requirements = req.body.requirements;
    report.status = 'Reviewed';
    if (typeof req.body.reviewNotes === 'string') {
      report.reviewNotes = req.body.reviewNotes;
    }

    const updated = await report.save();
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 4. APPROVE: Create Installation and update status
exports.approveReport = async (req, res) => {
  try {
    const report = await InspectionReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    // Promote details to the Installations collection for this exact inspection report.
    const installationPayload = {
      customerId: report.customerId,
      inspectionReportId: report._id,
      productType: report.inspectionMeta?.recommendedProducts?.join(', ') || 'Standard Installation',
      location: report.siteDetails?.buildingType || 'Site Location',
      siteDetails: report.siteDetails,
      materials: report.requirements?.materials || [],
      labour: report.requirements?.labour || null,
      financeNotes: req.body.financeNotes || report.reviewNotes,
      reviewNotes: report.reviewNotes,
    };

    const existingInstallation = await Installation.findOne({ inspectionReportId: report._id });

    if (existingInstallation) {
      await Installation.findByIdAndUpdate(
        existingInstallation._id,
        {
          $set: installationPayload,
        },
        { new: true }
      );
    } else {
      await Installation.create({
        ...installationPayload,
        status: 'Pending'
      });
    }

    report.status = 'Approved';
    report.reviewNotes = req.body.financeNotes || report.reviewNotes;
    await report.save();

    res.json({ success: true, message: 'Report approved and installation created' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 5. REJECT report
exports.rejectReport = async (req, res) => {
  try {
    if (!req.body.rejectionReason || !req.body.rejectionReason.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const existing = await InspectionReport.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Report not found' });

    const updated = await InspectionReport.findByIdAndUpdate(
      req.params.id,
      { status: 'Rejected', reviewNotes: req.body.rejectionReason.trim() },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};