const mongoose = require('mongoose');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const Installation = require('../shared/installation/Installation');
const Inspection = require('../shared/inspection/inspection');
const ServiceReport = require('../technician/technician.model');
const Customer = require('../customer/customer.model');
const { getLocalApiBaseUrl, DEFAULT_TEAM_NAME } = require('../../config/app.config');
const { INTERNAL_FETCH_TIMEOUT_MS } = require('../../config/defaults.config');
const {
  getRequestedTeamName,
  matchesJobTeam,
  getAssignmentLabel,
  matchesTeamName,
} = require('../../utils/team.utils');

/**
 * Returns the MongoDB collection handle for customer documents.
 * @returns {import('mongodb').Collection}
 */
const getCustomerCollection = () => mongoose.connection.db.collection('Customers');

/**
 * Builds normalized customer details with safe fallback values.
 * @param {object | null} customerDoc
 * @param {string} fallbackName
 * @returns {{name: string, address: string}}
 */
const buildCustomerDetails = (customerDoc, fallbackName = 'Unknown Customer') => ({
  name: customerDoc?.name || customerDoc?.customerName || fallbackName,
  address: customerDoc?.address || '-',
});

/**
 * Resolves a customer document by handling both string and ObjectId values.
 * @param {unknown} customerId
 * @returns {Promise<object | null>}
 */
const resolveCustomerById = async (customerId) => {
  if (!customerId || !mongoose.connection.db) {
    return null;
  }

  const stringId = typeof customerId === 'object' && customerId._id
    ? String(customerId._id)
    : String(customerId);

  const customer = await getCustomerCollection().findOne(
    {
      $or: [
        { _id: stringId },
        ...(mongoose.Types.ObjectId.isValid(stringId) ? [{ _id: new mongoose.Types.ObjectId(stringId) }] : []),
      ],
    },
    { projection: { name: 1, customerName: 1, address: 1 } }
  );

  return customer || null;
};

/**
 * Executes an internal JSON fetch with a timeout guard.
 * This prevents downstream APIs from stalling the history endpoint.
 * @param {string} url
 * @returns {Promise<object | null>}
 */
const fetchJsonWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTERNAL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Finds a task record by either Mongo ObjectId or ticket number/string.
 * @param {import('mongoose').Model} Model
 * @param {string} id
 * @returns {Promise<object | null>}
 */
const findTaskRecord = async (Model, id) => {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    return null;
  }

  const orFilters = [{ ticketId: normalizedId }];
  const numericId = Number(normalizedId);
  if (!Number.isNaN(numericId)) {
    orFilters.push({ ticketId: numericId });
  }
  if (mongoose.Types.ObjectId.isValid(normalizedId)) {
    orFilters.push({ _id: new mongoose.Types.ObjectId(normalizedId) });
  }

  return Model.findOne({ $or: orFilters }).lean();
};

/**
 * Loads task details from the tasks endpoint for enriched customer information.
 * @param {string} id
 * @param {string} teamName
 * @returns {Promise<object | null>}
 */
const loadTaskDetails = async (id, teamName) => {
  const query = teamName ? `?teamName=${encodeURIComponent(teamName)}` : '';
  return fetchJsonWithTimeout(`${getLocalApiBaseUrl()}/tasks/${id}${query}`);
};

/**
 * Returns the service history timeline for a customer anchored by task ID.
 */
exports.getCustomerHistory = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    const visibleStatuses = ['Assigned', 'Scheduled', 'In Progress', 'On Hold', 'Completed'];

    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Missing id parameter.' });
    }

    const source = String(req.query.source || 'service').toLowerCase();
    const sourceModel = source === 'installation'
      ? Installation
      : source === 'inspection'
        ? Inspection
        : ServiceRequest;

    /**
     * Prefers the declared source collection to keep lookup semantics predictable.
     * We still fall back later to avoid hard failures when source metadata is wrong.
     */
    const loadBySource = async () => {
      return findTaskRecord(sourceModel, id);
    };

    /**
     * Searches all supported collections when source-specific lookup fails.
     * This fallback improves resilience for mixed legacy identifiers.
     */
    const loadFromAnyCollection = async () => {
      const [serviceAnchor, installationAnchor, inspectionAnchor] = await Promise.all([
        findTaskRecord(ServiceRequest, id),
        findTaskRecord(Installation, id),
        findTaskRecord(Inspection, id)
      ]);

      return serviceAnchor || installationAnchor || inspectionAnchor || null;
    };

    const anchor = (await loadBySource()) || (await loadFromAnyCollection());
    if (!anchor) {
      return res.status(404).json({ success: false, message: 'No record found for the provided source and id.' });
    }

    const anchorTeamLabel = getAssignmentLabel(anchor);
    if (anchorTeamLabel && !matchesTeamName(anchorTeamLabel, requestedTeamName)) {
      return res.status(404).json({ success: false, message: 'No record found for the provided source and id.' });
    }

    const anchorCustomerId = typeof anchor.customerId === 'object' && anchor.customerId?._id
      ? anchor.customerId._id
      : anchor.customerId;
    const anchorCustomerIdStr = anchorCustomerId ? String(anchorCustomerId) : '';

    const customerDoc = await resolveCustomerById(anchorCustomerId);
    const customerDetails = buildCustomerDetails(customerDoc, anchor.customerName || 'Unknown Customer');
    const taskDetails = await loadTaskDetails(id, requestedTeamName);
    const resolvedCustomer = taskDetails?.customer || null;
    const customerName = resolvedCustomer?.name || customerDetails.name;
    const customerAddress = resolvedCustomer?.address || customerDetails.address || anchor.location || '-';

    const customerIdCandidates = [anchorCustomerId, anchorCustomerIdStr].filter((value) => value !== null && value !== undefined);
    if (mongoose.Types.ObjectId.isValid(anchorCustomerIdStr)) {
      customerIdCandidates.push(new mongoose.Types.ObjectId(anchorCustomerIdStr));
    }

    const customerIdQuery = { customerId: { $in: customerIdCandidates } };

    /**
     * Normalizes customer identifier shapes before strict equality checks.
     * This prevents false mismatches between ObjectId, strings, and embedded docs.
     */
    const toCustomerIdString = (value) => {
      if (!value) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        if (value._id) return String(value._id);
        if (value.id) return String(value.id);
      }
      return String(value);
    };

    /**
     * Filters records to the same anchor customer regardless of source schema.
     */
    const isSameCustomer = (item) => toCustomerIdString(item?.customerId) === anchorCustomerIdStr;

    const [services, installations, inspections] = await Promise.all([
      ServiceRequest.find({
        ...customerIdQuery,
        status: { $in: visibleStatuses }
      }).populate('assignedTeam', 'teamName').lean(),
      Installation.find({
        ...customerIdQuery,
        status: { $in: visibleStatuses }
      }).populate('assignedTeam', 'teamName').lean(),
      Inspection.find({
        ...customerIdQuery,
        status: { $in: visibleStatuses }
      }).populate('assignedTeam', 'teamName').lean(),
    ]);

    const filteredServices = services.filter(isSameCustomer);
    const filteredInstallations = installations.filter(isSameCustomer);
    const filteredInspections = inspections.filter(isSameCustomer);

    const teamFilteredServices = filteredServices.filter((item) => matchesJobTeam(item, requestedTeamName));
    const teamFilteredInstallations = filteredInstallations.filter((item) => matchesJobTeam(item, requestedTeamName));
    const teamFilteredInspections = filteredInspections.filter((item) => matchesJobTeam(item, requestedTeamName));

    /**
     * Maps source-specific records into a single history DTO consumed by the UI.
     * Keeping this mapper local ensures status and warranty rules stay consistent.
     */
    const toHistoryItem = (item, type) => {
      const rawStatus = String(item.status || 'Scheduled').trim();
      const normalizedKey = rawStatus.toLowerCase();
      const statusMap = {
        assigned: 'Assigned',
        completed: 'Completed',
        'in progress': 'In Progress',
        scheduled: 'Scheduled',
        'on hold': 'On Hold',
      };
      const normalizedStatus = statusMap[normalizedKey] || 'Scheduled';

      return {
        ticketId: `#${String(item._id)}`,
        serviceType: type,
        productType: item.productType || 'N/A',
        date: normalizedStatus === 'Assigned' ? null : (item.serviceDate || item.date || item.createdAt || null),
        status: normalizedStatus,
          assignedTeam: type === 'Inspection'
            ? 'Inspection Team A'
            : (item.assignedTeam?.teamName || item.assignedTeamName || getAssignmentLabel(item) || 'Unassigned'),
        warrantyStatus: type === 'Inspection'
          ? 'Warranty Period not started yet'
          : type === 'Installation'
            ? 'Warranty Activated'
            : (item.isUnderWarranty ? 'Warranty Claimed' : 'Warranty Not Claimed')
      };
    };

    const history = [
      ...teamFilteredServices.map((item) => toHistoryItem(item, 'Service')),
      ...teamFilteredInstallations.map((item) => toHistoryItem(item, 'Installation')),
      ...teamFilteredInspections.map((item) => toHistoryItem(item, 'Inspection')),
    ].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });

    const latestInstallation = teamFilteredInstallations
      .slice()
      .sort((a, b) => new Date(b.date || b.serviceDate || b.createdAt || 0).getTime() - new Date(a.date || a.serviceDate || a.createdAt || 0).getTime())[0];

    res.json({
      success: true,
      data: {
        customerId: anchorCustomerIdStr,
        summary: {
          customerName,
          location: customerAddress,
          productType: anchor.productType || latestInstallation?.productType || 'N/A',
          installationDate: latestInstallation?.serviceDate || latestInstallation?.date || null
        },
        history
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Backward-compatible alias for customer history endpoint consumers.
 */
exports.getServiceHistory = exports.getCustomerHistory;