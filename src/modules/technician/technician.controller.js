const ServiceReport = require('./technician.model');
const ServiceRequest = require('../shared/serviceTicket/serviceTicket.model');
const Installation = require('../shared/installation/installation.model');
const Customer = require('../user/user.model');
const { EXECUTION_STATUS, REQUEST_TYPES } = require('../../constants/enums');

/**
 * Strips test prefixes from strings (e.g., "TEST:", "TESTEST_")
 */
const stripTestPrefix = (value) => {
  if (!value || typeof value !== 'string') return value;
  return value.replace(/^(TEST:|TESTEST_|TEST_)/i, '').trim();
};

const loadSourceRecord = async (serviceRequestId, onModel) => {
  if (!serviceRequestId) {
    return null;
  }

  if (onModel === 'Installation') {
    return Installation.findById(serviceRequestId).populate('customerId', 'fullName name email phoneNumber contactNo address').lean();
  }

  return ServiceRequest.findById(serviceRequestId).populate('customerId', 'fullName name email phoneNumber contactNo address').lean();
};

const buildCustomerSnapshot = (record) => {
  const customer = record?.customerId && typeof record.customerId === 'object' ? record.customerId : null;

  return {
    fullName: stripTestPrefix(customer?.fullName) || stripTestPrefix(record?.fullName) || stripTestPrefix(record?.customerName) || 'Unknown Customer',
    phone: customer?.phoneNumber || record?.phone || '',
    email: customer?.email || record?.email || '',
    address: stripTestPrefix(customer?.address) || stripTestPrefix(record?.location) || '',
  };
};

const getCustomerIdFromRecord = (record) => {
  const value = record?.customerId;
  if (!value) return '';

  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }

  return String(value);
};

const loadCustomerFromRecord = async (record) => {
  const customerId = getCustomerIdFromRecord(record);
  if (!customerId) {
    return null;
  }

  if (record?.customerId && typeof record.customerId === 'object' && record.customerId.fullName) {
    return record.customerId;
  }

  if (!Customer) {
    return null;
  }

  return Customer.findById(customerId).select('fullName name email phoneNumber contactNo address').lean();
};

const buildCustomerFromSource = async (sourceRecord, reportCustomer) => { console.log("sourceRecord:", sourceRecord); console.log("reportCustomer:", reportCustomer);
  const customerDoc = await loadCustomerFromRecord(sourceRecord);

  if (customerDoc) {
    return {
      fullName: stripTestPrefix(customerDoc.fullName) || stripTestPrefix(reportCustomer?.fullName) || stripTestPrefix(reportCustomer?.name) || 'Unknown Customer',
      phone: customerDoc.phoneNumber || customerDoc.contactNo || reportCustomer?.phone || '-',
      email: customerDoc.email || reportCustomer?.email || '-',
      address: stripTestPrefix(customerDoc.address) || stripTestPrefix(reportCustomer?.address) || stripTestPrefix(sourceRecord?.location) || '-',
    };
  }

  if (reportCustomer) {
    return {
      fullName: stripTestPrefix(reportCustomer.fullName) || stripTestPrefix(reportCustomer.name) || 'Unknown Customer',
      phone: reportCustomer.phone || '-',
      email: reportCustomer.email || '-',
      address: stripTestPrefix(reportCustomer.address) || stripTestPrefix(sourceRecord?.location) || '-',
    };
  }

  return buildCustomerSnapshot(sourceRecord);
};

const resolveMaterials = (sourceRecord, report) => {
  const sourceMaterials = Array.isArray(sourceRecord?.materials)
    ? sourceRecord.materials
    : Array.isArray(sourceRecord?.inspectionSnapshot?.requirements?.materials)
      ? sourceRecord.inspectionSnapshot.requirements.materials
      : [];

  if (sourceMaterials.length > 0) {
    return sourceMaterials;
  }

  return Array.isArray(report?.materialsUsed) ? report.materialsUsed : [];
};

const buildCustomerFromPayload = (body, sourceRecord) => {
  if (body?.customer && typeof body.customer === 'object') {
    return {
      fullName: body.customer.fullName || body.customer.name || 'Unknown Customer',
      phone: body.customer.phone || '',
      email: body.customer.email || '',
      address: body.customer.address || body.location || '',
    };
  }

  if (sourceRecord) {
    return buildCustomerSnapshot(sourceRecord);
  }

  return {
    fullName: body?.fullName || body?.name || body?.customerName || 'Unknown Customer',
    phone: body?.phone || '',
    email: body?.email || '',
    address: body?.address || body?.location || '',
  };
};

const toReviewDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const toDisplayDate = (value) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const mapServiceReportForReview = (report, sourceRecord) => {
  const customer = report.customer || buildCustomerSnapshot(sourceRecord);
  const productDetails = report.productDetails || {};
  const sourceTeamName = sourceRecord?.assignedTeam?.teamName || sourceRecord?.assignedTeamName || null;
  const requiredMaterials = resolveMaterials(sourceRecord, report);

  const cleanName = stripTestPrefix(customer.fullName) || stripTestPrefix(customer.name) || 'Unknown Customer';
  const cleanAddress = stripTestPrefix(customer.address) || stripTestPrefix(report.location) || stripTestPrefix(sourceRecord?.location) || '-';

  return {
    id: report.serviceReportId || String(report._id),
    fullName: cleanName,
    customerName: cleanName,
    phoneNumber: customer.phone || '-',
    emailAddress: customer.email || '-',
    address: cleanAddress,
    customerInfo: {
      fullName: cleanName,
      name: cleanName,
      phone: customer.phone || '-',
      email: customer.email || '-',
      address: cleanAddress,
    },
    location: cleanAddress,
    serviceDate: toDisplayDate(report.scheduledDate || sourceRecord?.serviceDate || sourceRecord?.date || report.submittedAt || report.createdAt),
    productType: productDetails.detailedType || productDetails.generalType || report.serviceType || sourceRecord?.productType || '-',
    requiredMaterials,
    serviceDetails: {
      team: report.teamName || sourceTeamName || 'Service Team',
      date: toDisplayDate(report.scheduledDate || sourceRecord?.serviceDate || report.submittedAt || report.createdAt),
      time: report.serviceTime || sourceRecord?.serviceTime || '-',
      note: report.notesFromMainTechnician || report.technicianComment || report.reviewNotes || sourceRecord?.notesFromTechnician || '-',
    },
    serviceTeam: report.teamName || sourceTeamName || 'Service Team',
    status: report.finalStatus || report.status || 'Pending',
    reviewNotes: report.reviewNotes || '',
    submittedAt: toReviewDate(report.submittedAt || report.createdAt),
  };
};

const mapServiceReportForList = (report, sourceRecord, resolvedCustomer) => {
  const customer = resolvedCustomer || report.customer || buildCustomerSnapshot(sourceRecord);
  const productDetails = report.productDetails || {};
  const requiredMaterials = resolveMaterials(sourceRecord, report);

  const cleanName = stripTestPrefix(customer.fullName) || stripTestPrefix(customer.name) || 'Unknown Customer';
  const cleanAddress = stripTestPrefix(customer.address) || stripTestPrefix(report.location) || stripTestPrefix(sourceRecord?.location) || '-';

  return {
    _id: report.serviceReportId || String(report._id),
    ticketId: report.serviceReportId || String(report.ticketId || report._id),
    fullName: cleanName,
    customerName: cleanName,
    phoneNumber: customer.phone || '-',
    address: cleanAddress,
    customer: {
      fullName: cleanName,
      name: cleanName,
      phone: customer.phone || '-',
      address: cleanAddress,
    },
    productType: productDetails.detailedType || productDetails.generalType || report.serviceType || sourceRecord?.productType || 'N/A',
    productDetails: {
      generalType: productDetails.generalType || report.serviceType || sourceRecord?.productType || 'N/A',
      detailedType: productDetails.detailedType || productDetails.generalType || report.serviceType || sourceRecord?.productType || 'N/A',
    },
    location: cleanAddress,
    date: toDisplayDate(report.scheduledDate || sourceRecord?.serviceDate || sourceRecord?.date || report.submittedAt || report.createdAt),
    serviceDate: toReviewDate(report.scheduledDate || sourceRecord?.serviceDate || sourceRecord?.date || report.submittedAt || report.createdAt),
    submittedAt: toReviewDate(report.submittedAt || report.createdAt),
    status: report.finalStatus || report.status || 'Pending',
    finalStatus: report.finalStatus || report.status || 'Pending',
    materialsUsed: requiredMaterials,
    notesFromMainTechnician: report.notesFromMainTechnician || '',
    technicianComment: report.technicianComment || '',
  };
};

// 1. GET all reports for the table view
exports.getAllServiceReports = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query = {
        $or: [
          { 'customer.fullName': searchRegex },
          { 'location': searchRegex },
          { 'productDetails.detailedType': searchRegex }
        ]
      };
    }

    const reports = await ServiceReport.find(query)
      .sort({ submittedAt: -1 })
      .lean();

    const data = await Promise.all(reports.map(async (report) => {
      const sourceRecord = await loadSourceRecord(report.serviceRequestId, report.onModel);
      const customer = await buildCustomerFromSource(sourceRecord, report.customer);
      return mapServiceReportForList(report, sourceRecord, customer);
    }));

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 2. GET detailed report for review/view
exports.getServiceReportById = async (req, res) => {
  try {
    const report = await ServiceReport.findById(req.params.id).lean();
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const sourceRecord = await loadSourceRecord(report.serviceRequestId, report.onModel);
    const customer = await buildCustomerFromSource(sourceRecord, report.customer);
    res.json({
      success: true,
      data: mapServiceReportForReview({ ...report, customer }, sourceRecord),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 3. Submit a new service report
exports.submitServiceReport = async (req, res) => {
  try {
    const serviceRequestId = String(req.body.serviceRequestId || req.body._id || '').trim();
    const onModel = String(req.body.onModel || '').trim();

    if (!serviceRequestId) {
      return res.status(400).json({ success: false, message: 'serviceRequestId is required' });
    }

    if (onModel !== 'ServiceRequest' && onModel !== 'Installation') {
      return res.status(400).json({ success: false, message: 'onModel must be ServiceRequest or Installation' });
    }

    const sourceRecord = await loadSourceRecord(serviceRequestId, onModel);
    const customer = buildCustomerFromPayload(req.body, sourceRecord);
    const reportPayload = {
      serviceRequestId,
      onModel,
      teamName: String(req.body.teamName || '').trim() || undefined,
      serviceType: req.body.serviceType || (onModel === 'Installation' ? REQUEST_TYPES.INSTALLATION : REQUEST_TYPES.SERVICE),
      customer,
      location: req.body.location || sourceRecord?.location || customer.address || '',
      scheduledDate: req.body.scheduledDate || sourceRecord?.serviceDate || sourceRecord?.date || sourceRecord?.createdAt || null,
      productDetails: req.body.productDetails || {
        generalType: req.body.productType || sourceRecord?.productType || '',
        detailedType: req.body.detailedProductType || req.body.productType || sourceRecord?.productType || '',
        description: req.body.description || sourceRecord?.serviceDescription || '',
      },
      materialsUsed: Array.isArray(req.body.materialsUsed)
        ? req.body.materialsUsed
        : (Array.isArray(req.body.materials) ? req.body.materials : []),
      notesFromMainTechnician: String(req.body.notesFromMainTechnician || req.body.technicianComment || req.body.notes || sourceRecord?.reviewNotes || '').trim(),
      technicianComment: String(req.body.technicianComment || '').trim(),
      reviewNotes: String(req.body.reviewNotes || '').trim(),
      finalStatus: req.body.finalStatus || EXECUTION_STATUS.COMPLETED,
      submittedAt: req.body.submittedAt || new Date(),
    };

    const updatedReport = await ServiceReport.findOneAndUpdate(
      { serviceRequestId, onModel },
      { $set: reportPayload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    if (sourceRecord) {
      const sourceModel = onModel === 'Installation' ? Installation : ServiceRequest;
      await sourceModel.findByIdAndUpdate(serviceRequestId, {
        status: EXECUTION_STATUS.COMPLETED,
        notesFromTechnician: reportPayload.notesFromMainTechnician,
        reviewNotes: reportPayload.reviewNotes,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Service report submitted successfully',
      data: mapServiceReportForReview(updatedReport, sourceRecord),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 4. Update an existing service report
exports.updateServiceReport = async (req, res) => {
  try {
    const report = await ServiceReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (typeof req.body.reviewNotes === 'string') {
      report.reviewNotes = req.body.reviewNotes.trim();
    }

    if (typeof req.body.finalStatus === 'string') {
      report.finalStatus = req.body.finalStatus.trim();
    } else if (typeof req.body.status === 'string') {
      report.finalStatus = req.body.status.trim();
    }

    const updated = await report.save();
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.toString = (req, res) => {
  res.json({ message: "Technician module placeholder" });
};



