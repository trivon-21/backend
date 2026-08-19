const ServiceRequest = require('./serviceTicket.model');
const Installation = require('../installation/installation.model');
const Inspection = require('../inspection/inspection.model');
const Customer = require('../../user/user.model');
const mongoose = require('mongoose');
const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
  REQUEST_TYPES,
  STATUS_GROUPS,
  DEFAULTS,
} = require('../../../constants/enums');

const VISIBLE_STATUSES = STATUS_GROUPS.SERVICE_REQUEST_VISIBLE;


exports.getAllServiceRequests = async (req, res) => {
  try {
    const serviceRequests = await ServiceRequest.find({ 
      status: { $in: VISIBLE_STATUSES },
      serviceType: { $ne: 'Maintenance' }
    })
      .populate('customerId', 'fullName name address')
      .populate('assignedTeam', 'teamName')
      .lean();

    // Transform data to ensure consistent customer and team information for UI display
    const data = serviceRequests.map((item) => ({
      ...item,
      fullName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
      location: item.customerId?.address || item.location || '-',
      assignedTeam: item.assignedTeam?.teamName || item.assignedTeamName || DEFAULTS.UNASSIGNED
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.getServiceRequestById = async (req, res) => {
  try {
    const service = await ServiceRequest.findById(req.params.id)
      .populate('customerId', 'fullName name email phoneNumber contactNo address')
      .populate('assignedTeam', 'teamName')
      .lean();

    if (!service) return res.status(404).json({ success: false, message: 'Not found' });

    // Calculate progress percentage based on completed tasks
    const overallProgress = service.progress?.totalTasks > 0 
      ? Math.round((service.progress.completedTasks / service.progress.totalTasks) * 100) 
      : 0;

    res.json({ success: true, data: { ...service, overallProgress } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.getCustomerHistory = async (req, res) => {
  try {
    // Validate and extract parameters
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }

    // Determine source model based on query parameter
    const source = String(req.query.source || REQUEST_TYPES.SERVICE).toLowerCase();
    const sourceModel = source === REQUEST_TYPES.INSTALLATION.toLowerCase()
      ? Installation
      : source === REQUEST_TYPES.INSPECTION.toLowerCase()
        ? Inspection
        : ServiceRequest;

    
    const loadBySource = async () => {
      let record = null;

      if (mongoose.Types.ObjectId.isValid(id)) {
        record = await sourceModel.findById(id).lean();
      }

      // Installation has numeric ticketId as alternative lookup
      if (!record && source === REQUEST_TYPES.INSTALLATION.toLowerCase()) {
        const numericTicketId = Number(id);
        if (!Number.isNaN(numericTicketId)) {
          record = await Installation.findOne({ ticketId: numericTicketId }).lean();
        }
      }

      return record;
    };

    
    const loadFromAnyCollection = async () => {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
      }

      const [serviceAnchor, installationAnchor, inspectionAnchor] = await Promise.all([
        ServiceRequest.findById(id).lean(),
        Installation.findById(id).lean(),
        Inspection.findById(id).lean()
      ]);

      return serviceAnchor || installationAnchor || inspectionAnchor || null;
    };

    // Load anchor record using source-specific or fallback strategy
    const anchor = (await loadBySource()) || (await loadFromAnyCollection());
    if (!anchor) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    
    const anchorCustomerId = typeof anchor.customerId === 'object' && anchor.customerId?._id
      ? anchor.customerId._id
      : anchor.customerId;
    const anchorCustomerIdStr = String(anchorCustomerId);

    
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

    // Execute parallel queries for all record types
    const [services, installations, inspections, customer] = await Promise.all([
      ServiceRequest.find({
        ...customerIdQuery,
        status: { $in: VISIBLE_STATUSES }
      }).populate('assignedTeam', 'teamName').lean(),
      Installation.find({
        ...customerIdQuery,
        status: { $in: VISIBLE_STATUSES }
      }).populate('assignedTeam', 'teamName').lean(),
      Inspection.find({
        ...customerIdQuery,
        status: { $in: VISIBLE_STATUSES }
      }).populate('assignedTeam', 'teamName').lean(),
      Customer.findById(mongoose.Types.ObjectId.isValid(anchorCustomerIdStr) ? anchorCustomerIdStr : anchorCustomerId).lean()
    ]);

    // Filter results to ensure customer match
    const filteredServices = services.filter(isSameCustomer);
    const filteredInstallations = installations.filter(isSameCustomer);
    const filteredInspections = inspections.filter(isSameCustomer);

    const toHistoryItem = (item, type) => {
      const rawStatus = String(item.status || EXECUTION_STATUS.SCHEDULED);
      // Normalize status to standard values
      const normalizedStatus = STATUS_GROUPS.HISTORY_NORMALIZED.includes(rawStatus)
        ? rawStatus
        : EXECUTION_STATUS.SCHEDULED;

      return {
        ticketId: `#${String(item._id)}`,
        serviceType: type,
        productType: item.productType || 'N/A',
        date: item.serviceDate || item.date || item.createdAt || null,
        status: normalizedStatus,
        assignedTeam: type === REQUEST_TYPES.INSPECTION
          ? DEFAULTS.INSPECTION_TEAM_NAME
          : (item.assignedTeam?.teamName || item.assignedTeamName || DEFAULTS.UNASSIGNED),
        warrantyStatus: type === REQUEST_TYPES.INSPECTION
          ? 'Warranty Period not started yet'
          : type === REQUEST_TYPES.INSTALLATION
            ? 'Warranty Activated'
            : (item.isUnderWarranty ? 'Warranty Claimed' : 'Warranty Not Claimed')
      };
    };

    // Build complete history from all record types
    const history = [
      ...filteredServices.map((item) => toHistoryItem(item, REQUEST_TYPES.SERVICE)),
      ...filteredInstallations.map((item) => toHistoryItem(item, REQUEST_TYPES.INSTALLATION)),
      ...filteredInspections.map((item) => toHistoryItem(item, REQUEST_TYPES.INSPECTION)),
    ].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    // Extract latest installation for warranty activation date
    const latestInstallation = filteredInstallations
      .slice()
      .sort((a, b) => new Date(b.date || b.serviceDate || b.createdAt || 0).getTime() - new Date(a.date || a.serviceDate || a.createdAt || 0).getTime())[0];

    // Return structured response with summary and complete history
    res.json({
      success: true,
      data: {
        customerId: anchorCustomerIdStr,
        summary: {
          fullName: customer?.fullName || 'Unknown Customer',
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



