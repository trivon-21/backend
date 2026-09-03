const InspectionReport = require('./inspectionReport.model');
const Installation = require('../installation/installation.model');
const Customer = require('../../user/user.model');
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
      ? await Customer.find({ _id: { $in: customerIds } }, 'fullName address phoneNumber').lean()
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
        fullName: customer?.fullName || null,
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
    let id = req.params.id;
    if (id && id.startsWith('#')) id = id.substring(1);
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);

    const report = await InspectionReport.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { reportId: id }
      ]
    }).lean();

    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const customerId = toCustomerId(report.customerId);
    let customer = customerId
      ? await Customer.findById(customerId, 'fullName name email phoneNumber contactNo address').lean()
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
        customer = await Customer.findById(fallbackCustomerId, 'fullName name email phoneNumber contactNo address').lean();
      }
    }

    res.json({
      success: true,
      data: {
        ...report,
        customerId: customer || report.customerId || null,
        fullName: customer?.fullName || null,
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
    let id = req.params.id;
    if (id && id.startsWith('#')) id = id.substring(1);
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);

    const report = await InspectionReport.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { reportId: id }
      ]
    });
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
    let id = req.params.id;
    if (id && id.startsWith('#')) id = id.substring(1);
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);

    const report = await InspectionReport.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { reportId: id }
      ]
    });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const recommendedProduct = String(req.body.recommendedProduct || '').trim();
    if (!recommendedProduct) {
      return res.status(400).json({ success: false, message: 'Recommended product is required' });
    }

    const normalizedReviewNotes = String(req.body.financeNotes || '').trim();
    const inspectionMeta = report.inspectionMeta || {};
    inspectionMeta.recommendedProducts = [recommendedProduct];
    const reviewNotes = normalizedReviewNotes || report.reviewNotes;

    // Generate unique INT- ticketId if creating a new installation
    let ticketId;
    const existingInstallation = await Installation.findOne({ inspectionTicketId: report._id });
    if (!existingInstallation) {
      const mongoose = require('mongoose');
      const CounterModel = mongoose.model('Counter');
      let counter = await CounterModel.findOneAndUpdate(
        { _id: 'installationTicket' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      if (!counter) {
        await CounterModel.updateOne({ _id: 'installationTicket' }, { $set: { seq: 1000 } }, { upsert: true });
        counter = { seq: 1000 };
      } else if (counter.seq < 1000) {
        counter = await CounterModel.findOneAndUpdate({ _id: 'installationTicket' }, { $set: { seq: 1000 } }, { new: true });
      }
      ticketId = `INT-${String(counter.seq).padStart(4, '0')}`;
    } else {
      ticketId = existingInstallation.ticketId;
    }

    // Fetch customer details via InspectionTicket
    let resolvedCustomerId = report.customerId;
    const InspectionTicket = mongoose.model('InspectionTicket');
    let ticket = null;
    
    if (report.ticketId) {
      ticket = await InspectionTicket.findById(report.ticketId);
      if (!resolvedCustomerId && ticket && ticket.customerId) {
        resolvedCustomerId = ticket.customerId;
      }
    }
    
    let customer = resolvedCustomerId ? await Customer.findById(resolvedCustomerId) : null;
    
    if (!customer) {
      // Build signature based on site details
      const site = report.siteDetails || {};
      const inspectionMeta = report.inspectionMeta || {};
      const dateValue = inspectionMeta.date ? new Date(inspectionMeta.date).toISOString().slice(0, 10) : '';
      
      const signature = [
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

      const siblingReports = await InspectionReport.find({ _id: { $ne: report._id } }).lean();
      let fallbackCustomerId = null;
      for (const sibling of siblingReports) {
        const toCustomerId = (val) => {
          if (!val) return null;
          if (typeof val === 'string') return val;
          if (typeof val === 'object' && val._id) return String(val._id);
          if (typeof val === 'object' && val.id) return String(val.id);
          return String(val);
        };
        const siblingSite = sibling.siteDetails || {};
        const siblingMeta = sibling.inspectionMeta || {};
        const siblingDate = siblingMeta.date ? new Date(siblingMeta.date).toISOString().slice(0, 10) : '';
        const siblingSignature = [
          siblingSite.buildingType || '',
          siblingSite.floors ?? '',
          siblingSite.rooms ?? '',
          siblingSite.ceilingHeight || '',
          siblingSite.wallType || '',
          siblingSite.powerSupply || '',
          siblingSite.outdoorAccess || '',
          siblingDate,
          siblingMeta.time || '',
        ].join('|');

        if (siblingSignature === signature) {
          const siblingCustomerId = toCustomerId(sibling.customerId);
          if (siblingCustomerId) {
            fallbackCustomerId = siblingCustomerId;
            break;
          }
        }
      }

      if (fallbackCustomerId) {
        resolvedCustomerId = fallbackCustomerId;
        customer = await Customer.findById(fallbackCustomerId);
      }
    }

    // Promote details to the Installations collection for this exact inspection report.
    const installationPayload = {
      ticketId,
      orderId: report.orderId || null,
      customerId: resolvedCustomerId,
      assignedTeamId: null,
      assignedTeamName: '',
      fullName: customer?.fullName || report.customerName || report.fullName || 'Unknown Customer',
      customerEmail: customer?.email || report.customerEmail || '-',
      customerPhone: customer?.phoneNumber || report.contactNumber || report.customerPhone || '-',
      customerAddress: customer?.address || report.siteAddress || report.customerAddress || '-',
      inspectionTicketId: report._id,
      productType: recommendedProduct,
      units: report.units || 1,
      location: customer?.address || report.siteAddress || report.siteDetails?.buildingType || 'Site Location',
      serviceDate: report.inspectionDate || report.inspectionMeta?.date || ticket?.scheduledDate || report.createdAt || null,
      siteDetails: report.siteDetails,
      materials: report.requirements?.materials || [],
      labour: report.requirements?.labour || null,
      financeNotes: reviewNotes,
      reviewNotes,
      inspectionSnapshot: {
        inspectionMeta: inspectionMeta,
        findings: report.findings || [],
        requirements: report.requirements || {},
        photos: report.photos || [],
      },
      status: WORKFLOW_STATUS.NEW,
      updatedAt: new Date(),
    };

    // Use a raw collection upsert to avoid triggering Mongoose validation/hooks
    // that may attempt to re-validate the original InspectionReport document
    // (legacy enum values can cause those validations to fail). This writes
    // directly to MongoDB and then we update the report with a raw update.
    try {
      await Installation.collection.updateOne(
        { inspectionTicketId: report._id },
        { $set: installationPayload, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    } catch (instErr) {
      // If the raw collection write fails for any reason, propagate so caller
      // gets an error. We do not want silent failures here.
      throw instErr;
    }

    // Update the report document without running Mongoose validation (some
    // legacy findings.status values in the DB don't match the app enums).
    await InspectionReport.collection.updateOne(
      { _id: report._id },
      {
        $set: {
          'inspectionMeta.recommendedProducts': inspectionMeta.recommendedProducts,
          reviewNotes,
          status: INSPECTION_REVIEW_STATUS.APPROVED
        }
      }
    );

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

    let id = req.params.id;
    if (id && id.startsWith('#')) id = id.substring(1);
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    const query = {
      $or: [
        { _id: isValidId ? id : null },
        { reportId: id }
      ]
    };

    const existing = await InspectionReport.findOne(query);
    if (!existing) return res.status(404).json({ success: false, message: 'Report not found' });

    const updated = await InspectionReport.findOneAndUpdate(
      query,
      { status: INSPECTION_REVIEW_STATUS.REJECTED, reviewNotes: req.body.rejectionReason.trim() },
      { new: true }
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


