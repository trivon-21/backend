const mongoose = require('mongoose');
const ServiceRequest = require('../repair/repair.model');
const Installation = require('../installation/installation.model');
const Inspection = require('../inspection/inspectionTicket.model');
const ServiceReport = require('../../technician/technician.model');
const Customer = require('../../user/user.model');
const { getLocalApiBaseUrl, DEFAULT_TEAM_NAME } = require('../../../config/app.config');
const { INTERNAL_FETCH_TIMEOUT_MS } = require('../../../config/defaults.config');
const {
  getRequestedTeamName,
  matchesJobTeam,
  getAssignmentLabel,
  matchesTeamName,
} = require('../../../utils/team.utils');
const {
  EXECUTION_STATUS,
  REQUEST_TYPES,
  STATUS_GROUPS,
  DEFAULTS,
} = require('../../../constants/enums');

/**
 * Returns the MongoDB collection handle for customer documents.
 * @returns {import('mongodb').Collection}
 */
const getCustomerCollection = () => mongoose.connection.db.collection('users');

/**
 * Builds normalized customer details with safe fallback values.
 * @param {object | null} customerDoc
 * @param {string} fallbackName
 * @returns {{fullName: string, address: string}}
 */
const buildCustomerDetails = (customerDoc, fallbackName = 'Unknown Customer') => ({
  fullName: customerDoc?.fullName || customerDoc?.fullName || fallbackName,
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
    { projection: { fullName: 1, fullName: 1, address: 1 } }
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
 * Normalizes customer identifier shapes before strict equality checks.
 * This prevents false mismatches between ObjectId, strings, and embedded docs.
 */
const toCustomerIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
    // Handle raw ObjectId objects
    if (typeof value.toString === 'function') return value.toString();
  }
  return String(value);
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

  const orFilters = [];
  if (/^\d+$/.test(normalizedId)) {
    orFilters.push({ ticketId: Number(normalizedId) });
  }
  if (mongoose.Types.ObjectId.isValid(normalizedId)) {
    orFilters.push({ _id: new mongoose.Types.ObjectId(normalizedId) });
  }
  orFilters.push({ ticketId: normalizedId });
  orFilters.push({ ticketRef: normalizedId });
  orFilters.push({ serviceRequestRef: normalizedId });
  orFilters.push({ serviceRequestId: normalizedId });

  if (orFilters.length === 0) return null;

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
    const visibleStatuses = STATUS_GROUPS.EXECUTION_VISIBLE;

    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Missing id parameter.' });
    }

    const source = String(req.query.source || REQUEST_TYPES.SERVICE).toLowerCase();
    const sourceModel = source === REQUEST_TYPES.INSTALLATION.toLowerCase()
      ? Installation
      : source === REQUEST_TYPES.INSPECTION.toLowerCase()
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

    const rawAnchorCustomer = anchor.customerId || anchor.customer || anchor.userId;
    const anchorCustomerIdStr = toCustomerIdString(rawAnchorCustomer);
    const anchorCustomerId = anchorCustomerIdStr;

    const customerDoc = await resolveCustomerById(anchorCustomerId);
    const customerDetails = buildCustomerDetails(customerDoc, anchor.fullName || 'Unknown Customer');
    const taskDetails = await loadTaskDetails(id, requestedTeamName);
    const resolvedCustomer = taskDetails?.customer || null;
    const fullName = resolvedCustomer?.fullName || customerDetails.fullName;
    const customerAddress = resolvedCustomer?.address || customerDetails.address || anchor.location || '-';

    const customerIdCandidates = [anchorCustomerId, anchorCustomerIdStr].filter((value) => value !== null && value !== undefined);
    if (mongoose.Types.ObjectId.isValid(anchorCustomerIdStr)) {
      customerIdCandidates.push(new mongoose.Types.ObjectId(anchorCustomerIdStr));
    }

    const customerQuery = {
      $or: [
        { customerId: { $in: customerIdCandidates } },
        { customer: { $in: customerIdCandidates } },
        { userId: { $in: customerIdCandidates } }
      ]
    };

    /**
     * Filters records to the same anchor customer regardless of source schema.
     */
    const isSameCustomer = (item) => {
      const itemCustomer = item?.customerId || item?.customer || item?.userId;
      return toCustomerIdString(itemCustomer) === anchorCustomerIdStr;
    };

    const [services, installations, inspections] = await Promise.all([
      ServiceRequest.find({
        ...customerQuery,
        status: { $in: visibleStatuses }
      }).populate('assignedTeam', 'teamName').lean(),
      Installation.find({
        ...customerQuery,
        status: { $in: visibleStatuses }
      }).populate('assignedTeam', 'teamName').lean(),
      Inspection.find({
        ...customerQuery,
        status: { $in: visibleStatuses }
      }).populate('assignedTeam', 'teamName').lean()
    ]);

    const filteredServices = services.filter(isSameCustomer);
    const filteredInstallations = installations.filter(isSameCustomer);
    const filteredInspections = inspections.filter(isSameCustomer);

    const teamFilteredServices = filteredServices;
    const teamFilteredInstallations = filteredInstallations;
    const teamFilteredInspections = filteredInspections;

    /**
     * Maps source-specific records into a single history DTO consumed by the UI.
     * Keeping this mapper local ensures status and warranty rules stay consistent.
     */
    const toHistoryItem = (item, type) => {
      const rawStatus = String(item.status || EXECUTION_STATUS.SCHEDULED).trim();
      const normalizedKey = rawStatus.toLowerCase();
      const statusMap = {
        [EXECUTION_STATUS.ASSIGNED.toLowerCase()]: EXECUTION_STATUS.ASSIGNED,
        [EXECUTION_STATUS.COMPLETED.toLowerCase()]: EXECUTION_STATUS.COMPLETED,
        [EXECUTION_STATUS.IN_PROGRESS.toLowerCase()]: EXECUTION_STATUS.IN_PROGRESS,
        [EXECUTION_STATUS.SCHEDULED.toLowerCase()]: EXECUTION_STATUS.SCHEDULED,
        [EXECUTION_STATUS.ON_HOLD.toLowerCase()]: EXECUTION_STATUS.ON_HOLD,
        'inspected': EXECUTION_STATUS.COMPLETED,
      };
      const normalizedStatus = statusMap[normalizedKey] || EXECUTION_STATUS.SCHEDULED;

      return {
        ticketId: item.serviceRequestId || item.serviceRequestRef || item.ticketId || item.ticketRef || `#${String(item._id)}`,
        serviceType: type,
        productType: item.productType || 'N/A',
        date: normalizedStatus === EXECUTION_STATUS.ASSIGNED ? null : (item.scheduledDate || item.serviceDate || item.date || item.createdAt || null),
        status: normalizedStatus,
        assignedTeam: type === REQUEST_TYPES.INSPECTION
          ? DEFAULTS.INSPECTION_TEAM_NAME
          : (item.assignedTeam?.teamName || item.assignedTeamName || getAssignmentLabel(item) || DEFAULTS.UNASSIGNED),
        warrantyStatus: type === REQUEST_TYPES.INSPECTION
          ? 'Warranty Period not started yet'
          : type === REQUEST_TYPES.INSTALLATION
            ? (normalizedStatus === EXECUTION_STATUS.COMPLETED ? 'Warranty Activated' : 'Warranty Period not started yet')
            : (item.isUnderWarranty ? 'Warranty Claimed' : 'Warranty Not Claimed')
      };
    };

    const history = [
      ...teamFilteredServices.map((item) => toHistoryItem(item, REQUEST_TYPES.SERVICE)),
      ...teamFilteredInstallations.map((item) => toHistoryItem(item, REQUEST_TYPES.INSTALLATION)),
      ...teamFilteredInspections.map((item) => toHistoryItem(item, REQUEST_TYPES.INSPECTION)),
    ].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : Number.NEGATIVE_INFINITY;
      const bTime = b.date ? new Date(b.date).getTime() : Number.NEGATIVE_INFINITY;
      return bTime - aTime;
    });

    const latestInstallation = teamFilteredInstallations
      .slice()
      .sort((a, b) => new Date(b.serviceDate || b.date || b.createdAt || 0).getTime() - new Date(a.serviceDate || a.date || a.createdAt || 0).getTime())[0];

    res.json({
      success: true,
      data: {
        customerId: anchorCustomerIdStr,
        summary: {
          customerName: fullName,
          location: customerAddress,
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


