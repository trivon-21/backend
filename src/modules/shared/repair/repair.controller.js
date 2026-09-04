const ServiceRequest = require('./repair.model');
const Installation = require('../installation/installation.model');
const Inspection = require('../inspection/inspectionTicket.model');
const Customer = require('../../user/user.model');
const mongoose = require('mongoose');
const {
  EXECUTION_STATUS,
  REQUEST_TYPES,
  STATUS_GROUPS,
  DEFAULTS,
} = require('../../../constants/enums');

const VISIBLE_STATUSES = STATUS_GROUPS.SERVICE_REQUEST_VISIBLE;

exports.getAllServiceRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    const serviceRequests = await ServiceRequest.find(query)
      .populate('customerId', 'fullName name address')
      .lean();

    const data = serviceRequests.map((item) => ({
      ...item,
      fullName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
      customerName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
      location: item.customerId?.address || item.location || '-',
      assignedTeam: item.assignedTeamName || DEFAULTS.UNASSIGNED
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getServiceRequestById = async (req, res) => {
  try {
    const id = req.params.id;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { serviceRequestRef: id }, { serviceRequestId: id }] }
      : { $or: [{ serviceRequestRef: id }, { serviceRequestId: id }] };

    const service = await ServiceRequest.findOne(query)
      .populate('customerId', 'fullName name email phoneNumber contactNo address')
      .lean();

    if (!service) return res.status(404).json({ success: false, message: 'Not found' });

    const overallProgress = service.progress?.totalTasks > 0
      ? Math.round((service.progress.completedTasks / service.progress.totalTasks) * 100)
      : 0;
      
    const mappedService = {
      ...service,
      customerName: service.customerId?.fullName || service.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
      productType: service.productType || service.acUnitModel || service.category || service.repairType || '-',
      serviceDescription: service.description || service.serviceDescription || service.notes || service.subject || '-',
    };
    if (mappedService.customerId) {
        mappedService.customerId.name = mappedService.customerId.fullName || mappedService.customerId.name;
        mappedService.customerId.contactNo = mappedService.customerId.phoneNumber || mappedService.customerId.contactNo;
    }

    res.json({ success: true, data: { ...mappedService, overallProgress } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getCustomerHistory = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    const source = String(req.query.source || REQUEST_TYPES.SERVICE).toLowerCase();
    const sourceModel = source === REQUEST_TYPES.INSTALLATION.toLowerCase()
      ? Installation
      : source === REQUEST_TYPES.INSPECTION.toLowerCase()
        ? Inspection
        : ServiceRequest;

    const buildFilters = () => {
      const orFilters = [];
      if (mongoose.Types.ObjectId.isValid(id)) {
        orFilters.push({ _id: id });
      }
      const numId = Number(id);
      if (!Number.isNaN(numId)) {
        orFilters.push({ ticketId: numId });
      }
      orFilters.push({ ticketId: id });
      orFilters.push({ ticketRef: id });
      orFilters.push({ serviceRequestRef: id });
      orFilters.push({ serviceRequestId: id });
      return orFilters;
    };

    const loadBySource = async () => {
      const filters = buildFilters();
      return sourceModel.findOne({ $or: filters }).lean();
    };

    const loadFromAnyCollection = async () => {
      const filters = buildFilters();
      const [serviceAnchor, installationAnchor, inspectionAnchor] = await Promise.all([
        ServiceRequest.findOne({ $or: filters }).lean(),
        Installation.findOne({ $or: filters }).lean(),
        Inspection.findOne({ $or: filters }).lean()
      ]);

      return serviceAnchor || installationAnchor || inspectionAnchor || null;
    };

    const anchor = (await loadBySource()) || (await loadFromAnyCollection());
    if (!anchor) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const anchorCustomerId = typeof anchor.customerId === 'object' && anchor.customerId?._id
      ? anchor.customerId._id
      : anchor.customerId;
    const anchorCustomerIdStr = anchorCustomerId ? String(anchorCustomerId) : null;
    
    if (!anchorCustomerIdStr) {
      return res.json({
        success: true,
        data: {
          customerId: null,
          summary: {
            customerName: 'Unknown Customer',
            location: anchor.location || '-',
            productType: anchor.productType || 'N/A',
            installationDate: anchor.serviceDate || anchor.date || null
          },
          history: []
        }
      });
    }

    const customerIdCandidates = [anchorCustomerId, anchorCustomerIdStr].filter((value) => value !== null && value !== undefined);
    if (mongoose.Types.ObjectId.isValid(anchorCustomerIdStr)) {
      customerIdCandidates.push(new mongoose.Types.ObjectId(anchorCustomerIdStr));
    }

    const customerIdQuery = { customerId: { $in: customerIdCandidates } };

    const toCustomerIdString = (value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        if (value._id) return String(value._id);
        if (value.id) return String(value.id);
      }
      return String(value);
    };

    const isSameCustomer = (item) => toCustomerIdString(item?.customerId) === anchorCustomerIdStr;

    const [services, installations, inspections, customer] = await Promise.all([
      ServiceRequest.find({
        ...customerIdQuery,
        
      }).lean(),
      Installation.find({
        ...customerIdQuery,
        
      }).lean(),
      Inspection.find({
        ...customerIdQuery,
        
      }).lean(),
      Customer.findById(mongoose.Types.ObjectId.isValid(anchorCustomerIdStr) ? anchorCustomerIdStr : null).lean()
    ]);

    const filteredServices = services.filter(isSameCustomer);
    const filteredInstallations = installations.filter(isSameCustomer);
    const filteredInspections = inspections.filter(isSameCustomer);

    const toHistoryItem = (item, type) => {
      const rawStatus = String(item.status || EXECUTION_STATUS.SCHEDULED);
      const normalizedStatus = STATUS_GROUPS.HISTORY_NORMALIZED.includes(rawStatus)
        ? rawStatus
        : EXECUTION_STATUS.SCHEDULED;

      return {
        ticketId: item.serviceRequestId || item.serviceRequestRef || item.ticketId || item.ticketRef || `#${String(item._id)}`,
        serviceType: type,
        productType: item.productType || 'N/A',
        date: item.serviceDate || item.date || item.createdAt || null,
        status: normalizedStatus,
        assignedTeam: type === REQUEST_TYPES.INSPECTION
          ? DEFAULTS.INSPECTION_TEAM_NAME
          : (item.assignedTeamName || DEFAULTS.UNASSIGNED),
        warrantyStatus: type === REQUEST_TYPES.INSPECTION
          ? 'Warranty Period not started yet'
          : type === REQUEST_TYPES.INSTALLATION
            ? 'Warranty Activated'
            : (item.isUnderWarranty ? 'Warranty Claimed' : 'Warranty Not Claimed')
      };
    };

    const history = [
      ...filteredServices.map((item) => toHistoryItem(item, REQUEST_TYPES.SERVICE)),
      ...filteredInstallations.map((item) => toHistoryItem(item, REQUEST_TYPES.INSTALLATION)),
      ...filteredInspections.map((item) => toHistoryItem(item, REQUEST_TYPES.INSPECTION)),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    const latestInstallation = filteredInstallations
      .slice()
      .sort((a, b) => new Date(b.date || b.serviceDate || b.createdAt || 0).getTime() - new Date(a.date || a.serviceDate || a.createdAt || 0).getTime())[0];

    res.json({
      success: true,
      data: {
        customerId: anchorCustomerIdStr,
        summary: {
          customerName: customer?.fullName || 'Unknown Customer',
          location: customer?.address || anchor.location || '-',
          productType: anchor.productType || latestInstallation?.productType || 'N/A',
          installationDate: anchor.serviceDate || anchor.date || latestInstallation?.serviceDate || latestInstallation?.date || null
        },
        history
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


