const InspectionReport = require('./inspectionReport.model');
const Installation = require('../installation/installation.model');
const Customer = require('../../customer/customer.model');
const {
  WORKFLOW_STATUS,
  INSPECTION_REVIEW_STATUS,
} = require('../../../constants/enums');

const toCustomerId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value);
};

const buildReportSignature = (report) => {
  const site = report?.siteDetails || {};
  const inspectionMeta = report?.inspectionMeta || {};
  const dateValue = inspectionMeta.date ? new Date(inspectionMeta.date).toISOString().slice(0, 10) : '';

  return [
    site.buildingType || '',
    site.floors ?? '',
    site.rooms ?? '',
    site.ceilingHeight || '',
    site.wallType || '',
    site.powerSupply || '',
    site.outdoorAccess || '',
    dateValue,
    inspectionMeta.time || '',
  ].join('|');
};

// 1. GET all reports with populated Customer details
exports.getAllReports = async (req, res) => {
  try {
    const reports = await InspectionReport.find()
      .sort({ updatedAt: -1 })
      .lean();

    const customerIds = Array.from(new Set(
      reports
        .map((item) => toCustomerId(item.customerId))
        .filter(Boolean)
    ));

    const customers = customerIds.length > 0
      ? await Customer.find({ _id: { $in: customerIds } }, 'name address contactNo').lean()
      : [];

    const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));

    // Build signature-based fallback map from reports that already have resolvable customers.
    const signatureCustomerIdMap = new Map();
    reports.forEach((report) => {
      const customerId = toCustomerId(report.customerId);
      if (!customerId || !customerById.has(customerId)) {
        return;
      }

      const signature = buildReportSignature(report);
      if (signature && !signatureCustomerIdMap.has(signature)) {
        signatureCustomerIdMap.set(signature, customerId);
      }
    });

    const enrichedReports = reports.map((report) => {
      const rawCustomerId = toCustomerId(report.customerId);
      const signature = buildReportSignature(report);
      const fallbackCustomerId = signatureCustomerIdMap.get(signature) || null;
      const resolvedCustomerId = (rawCustomerId && customerById.has(rawCustomerId))
        ? rawCustomerId
        : fallbackCustomerId;
      const customer = resolvedCustomerId ? customerById.get(resolvedCustomerId) : null;

      return {
        ...report,
        customerId: customer || report.customerId || null,
        customerName: customer?.name || null,
        customerAddress: customer?.address || null,
      };
    });

    res.json({ success: true, data: enrichedReports });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 2. GET single report by MongoDB ID
exports.getReportById = async (req, res) => {
  try {
    const report = await InspectionReport.findById(req.params.id)
      .lean();

    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const customerId = toCustomerId(report.customerId);
    let customer = customerId
      ? await Customer.findById(customerId, 'name email contactNo address').lean()
      : null;

    if (!customer) {
      const signature = buildReportSignature(report);
      const siblingReports = await InspectionReport.find({ _id: { $ne: report._id } }).lean();

      let fallbackCustomerId = null;
      for (const sibling of siblingReports) {
        if (buildReportSignature(sibling) !== signature) {
          continue;
        }

        const siblingCustomerId = toCustomerId(sibling.customerId);
        if (siblingCustomerId) {
          fallbackCustomerId = siblingCustomerId;
          break;
        }
      }

      if (fallbackCustomerId) {
        customer = await Customer.findById(fallbackCustomerId, 'name email contactNo address').lean();
      }
    }

    res.json({
      success: true,
      data: {
        ...report,
        customerId: customer || report.customerId || null,
        customerName: customer?.name || null,
        customerAddress: customer?.address || null,
      }
    });
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
    report.status = INSPECTION_REVIEW_STATUS.REVIEWED;
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

    const recommendedProduct = String(req.body.recommendedProduct || '').trim();
    if (!recommendedProduct) {
      return res.status(400).json({ success: false, message: 'Recommended product is required' });
    }

    const normalizedReviewNotes = String(req.body.financeNotes || '').trim();
    if (!report.inspectionMeta) {
      report.inspectionMeta = {};
    }
    report.inspectionMeta.recommendedProducts = [recommendedProduct];
    report.reviewNotes = normalizedReviewNotes || report.reviewNotes;

    // Promote details to the Installations collection for this exact inspection report.
    const installationPayload = {
      customerId: report.customerId,
      inspectionReportId: report._id,
      productType: recommendedProduct,
      location: report.siteDetails?.buildingType || 'Site Location',
      serviceDate: report.inspectionMeta?.date || null,
      siteDetails: report.siteDetails,
      materials: report.requirements?.materials || [],
      labour: report.requirements?.labour || null,
      financeNotes: normalizedReviewNotes || report.reviewNotes,
      reviewNotes: report.reviewNotes,
      inspectionSnapshot: {
        inspectionMeta: report.inspectionMeta || {},
        findings: report.findings || [],
        requirements: report.requirements || {},
        photos: report.photos || [],
      },
      status: WORKFLOW_STATUS.NEW,
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
      });
    }

    report.status = INSPECTION_REVIEW_STATUS.APPROVED;
    await report.save();

    res.json({ success: true, message: 'Report approved and installation created in New status' });
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
      { status: INSPECTION_REVIEW_STATUS.REJECTED, reviewNotes: req.body.rejectionReason.trim() },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
