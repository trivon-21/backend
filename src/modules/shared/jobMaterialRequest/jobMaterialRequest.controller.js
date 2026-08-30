const NewRequest = require('../serviceTicket/serviceTicket.model');
const JobMaterialRequest = require('./jobMaterialRequest.model');
const ServiceRequest = require('../repair/repair.model');
const Installation = require('../installation/installation.model');
const Customer = require('../../user/user.model');
const Maintenance = require('../maintenance/maintenance.model');
const { calculateWarrantyStatus } = require('../../../utils/warranty.utils');
const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
  MAINTENANCE_STATUS,
  REQUEST_TYPES,
  DEFAULTS,
  STATUS_GROUPS,
} = require('../../../constants/enums');
const materialWorkflow = require('./jobMaterialRequest.service');

function sendWorkflowError(res, error) {
  const duplicate = error?.code === 11000;
  res.status(duplicate ? 409 : (error.statusCode || (error.name === 'ValidationError' ? 400 : 500))).json({
    success: false,
    message: duplicate ? 'This job already has an active material request' : (error.message || 'Material workflow operation failed'),
    code: duplicate ? 'ACTIVE_MATERIAL_REQUEST_EXISTS' : (error.code || 'MATERIAL_WORKFLOW_FAILED'),
    details: error.details,
  });
}

exports.listCanonicalRequests = async (req, res) => {
  try {
    res.json({ success: true, data: await materialWorkflow.listRequests(req.query) });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.getMaterialCatalog = async (_req, res) => {
  try {
    res.json({ success: true, data: await materialWorkflow.getCatalog() });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.listEligibleJobs = async (_req, res) => {
  try {
    res.json({ success: true, data: await materialWorkflow.listEligibleJobs() });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.submitCanonicalRequest = async (req, res) => {
  try {
    const data = await materialWorkflow.submit(req.body, req.user);
    res.status(201).json({ success: true, message: 'Material request submitted to Finance', data });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.approveCanonicalRequest = async (req, res) => {
  try {
    const data = await materialWorkflow.decide(req.params.id, 'APPROVED', '', req.user, req.body.statusVersion);
    res.json({ success: true, message: 'Material request approved by Finance', data });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.rejectCanonicalRequest = async (req, res) => {
  try {
    const data = await materialWorkflow.decide(req.params.id, 'REJECTED', req.body.reason, req.user, req.body.statusVersion);
    res.json({ success: true, message: 'Material request rejected by Finance', data });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.sendCanonicalRequestToInventory = async (req, res) => {
  try {
    const data = await materialWorkflow.sendToInventory(req.params.id, req.body.statusVersion);
    res.json({ success: true, message: 'Material request sent to Inventory Manager', data });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.cancelCanonicalRequest = async (req, res) => {
  try {
    const data = await materialWorkflow.cancel(req.params.id, req.body.reason, req.body.statusVersion);
    res.json({ success: true, message: 'Material request cancelled', data });
  } catch (error) {
    sendWorkflowError(res, error);
  }
};

exports.getNewServiceTickets = async (req, res) => {
  try {
    const formatInstallationSiteDetails = (installation) => {
      const details = installation?.siteDetails || {};
      const parts = [
        details.buildingType ? `Building: ${details.buildingType}` : null,
        Number.isFinite(details.floors) ? `Floors: ${details.floors}` : null,
        Number.isFinite(details.rooms) ? `Rooms: ${details.rooms}` : null,
        details.ceilingHeight ? `Ceiling: ${details.ceilingHeight}` : null,
        details.wallType ? `Wall: ${details.wallType}` : null,
        details.powerSupply ? `Power: ${details.powerSupply}` : null,
        details.outdoorAccess ? `Outdoor Access: ${details.outdoorAccess}` : null,
      ].filter(Boolean);

      if (parts.length > 0) {
        return parts.join(' | ');
      }

      if (installation?.location) {
        return `Location: ${installation.location}`;
      }

      return 'Site details are not available.';
    };

  
    const toCustomerId = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        if (value._id) return String(value._id);
        if (value.id) return String(value.id);
      }
      return String(value);
    };

    // Fetch all new requests with customer details populated
    const newRequests = await NewRequest.find()
      .populate('customerId', 'fullName name email phoneNumber contactNo address')
      .lean();

    // Fetch ServiceRequests with 'Finance Rejected' status (can be recreated)
    const rejectedServiceRequests = await ServiceRequest.find({ status: WORKFLOW_STATUS.FINANCE_REJECTED })
      .populate('customerId', 'fullName name email phoneNumber contactNo address')
      .lean();

    // Fetch Installations with 'Finance Rejected' status (can be recreated)
    const rejectedInstallations = await Installation.find({ status: WORKFLOW_STATUS.FINANCE_REJECTED })
      .populate('customerId', 'fullName name email phoneNumber contactNo address')
      .lean();

    // Fetch Installations with 'New' status (freshly approved from inspection review)
    const newInstallations = await Installation.find({ status: WORKFLOW_STATUS.NEW })
      .populate('customerId', 'fullName name email phoneNumber contactNo address')
      .lean();

    // Fetch Maintenances with 'New' or 'Finance Rejected' status
    const newMaintenances = await Maintenance.find({ status: { $in: [MAINTENANCE_STATUS.NEW, MAINTENANCE_STATUS.FINANCE_REJECTED] } })
      .populate('customerId', 'fullName name email phoneNumber contactNo address')
      .lean();

    // Build customer lookup map to avoid N+1 queries
    const customerIds = Array.from(new Set(
      [
        ...newRequests,
        ...newInstallations,
        ...rejectedServiceRequests,
        ...rejectedInstallations,
        ...newMaintenances
      ]
        .map((request) => toCustomerId(request.customerId))
        .filter(Boolean)
    ));

    const customers = customerIds.length > 0
      ? await Customer.find({ _id: { $in: customerIds } }).lean()
      : [];
    const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));

    // Transform new requests
    const newRequestsData = await Promise.all(newRequests.map(async (request) => {
      const customerId = toCustomerId(request.customerId);
      const populatedCustomer = request.customerId && typeof request.customerId === 'object' ? request.customerId : null;
      const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
      const customerObjectId = customerId || request.customerId;

      // Calculate warranty status for this customer
      const { isUnderWarranty, isFreeOfCharge } = await calculateWarrantyStatus(customerObjectId);

      const resolvedServiceType = request.serviceType || request.requestType || request.request_type || 'Repair';

      return {
        ticketId: request._id,
        productType: request.productType || 'N/A',
        serviceType: resolvedServiceType,
        serviceDescription: request.serviceDescription || request.description || request.problemDescription || request.subject || '-',
        fullName: customer?.fullName || request.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
        customerEmail: customer?.email || request.customerEmail || '-',
        customerphoneNumber: customer?.phoneNumber || request.customerPhone || request.customerphoneNumber || '-',
        customerAddress: customer?.address || request.customerAddress || request.location || '-',
        isUnderWarranty,
        isFreeOfCharge,
        requestType: resolvedServiceType === 'Maintenance' ? 'Maintenance' : 'Repair',
        status: WORKFLOW_STATUS.NEW,
        materials: [],
        financeNotes: '',
        location: request.location || '-'
      };
    }));

    // Transform rejected service requests
    const rejectedServiceRequestsData = rejectedServiceRequests.map((request) => {
      const customerId = toCustomerId(request.customerId);
      const populatedCustomer = request.customerId && typeof request.customerId === 'object' ? request.customerId : null;
      const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

      return {
        ticketId: request._id,
        productType: request.productType || 'N/A',
        serviceType: request.serviceType || request.requestType || request.request_type || 'Repair',
        serviceDescription: request.serviceDescription || request.description || request.problemDescription || request.subject || '-',
        fullName: customer?.fullName || 'Unknown Customer',
        customerEmail: customer?.email || '-',
        customerphoneNumber: customer?.phoneNumber || '-',
        customerAddress: customer?.address || '-',
        isUnderWarranty: request.isUnderWarranty || false,
        isFreeOfCharge: request.isFreeOfCharge || false,
        requestType: request.serviceType || 'Repair',
        status: WORKFLOW_STATUS.FINANCE_REJECTED,
        note: 'Finance Rejected - Available for Re-submission',
        materials: request.materials || [],
        financeNotes: request.financeNotes || '',
        location: request.location || '-'
      };
    });

    // Transform rejected installations
    const rejectedInstallationsData = rejectedInstallations.map((installation) => {
      const customerId = toCustomerId(installation.customerId);
      const populatedCustomer = installation.customerId && typeof installation.customerId === 'object' ? installation.customerId : null;
      const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
      const siteDetailsSummary = formatInstallationSiteDetails(installation);

      return {
        ticketId: installation._id,
        productType: installation.productType || 'N/A',
        serviceDescription: siteDetailsSummary,
        fullName: customer?.fullName || 'Unknown Customer',
        customerEmail: customer?.email || '-',
        customerphoneNumber: customer?.phoneNumber || '-',
        customerAddress: customer?.address || installation.location || '-',
        isUnderWarranty: false,
        isFreeOfCharge: false,
        requestType: REQUEST_TYPES.INSTALLATION,
        status: WORKFLOW_STATUS.FINANCE_REJECTED,
        note: 'Finance Rejected - Available for Re-submission',
        materials: installation.materials || [],
        financeNotes: installation.financeNotes || '',
        location: installation.location || '-',
        siteDetails: installation.siteDetails || {},
      };
    });

    // Transform new installations
    const newInstallationsData = newInstallations.map((installation) => {
      const customerId = toCustomerId(installation.customerId);
      const populatedCustomer = installation.customerId && typeof installation.customerId === 'object' ? installation.customerId : null;
      const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
      const siteDetailsSummary = formatInstallationSiteDetails(installation);

      return {
        ticketId: installation._id,
        productType: installation.productType || 'N/A',
        serviceDescription: siteDetailsSummary,
        fullName: customer?.fullName || 'Unknown Customer',
        customerEmail: customer?.email || '-',
        customerphoneNumber: customer?.phoneNumber || '-',
        customerAddress: customer?.address || installation.location || '-',
        isUnderWarranty: false,
        isFreeOfCharge: false,
        requestType: REQUEST_TYPES.INSTALLATION,
        status: WORKFLOW_STATUS.NEW,
        note: 'New installation - ready for material submission',
        materials: installation.materials || [],
        financeNotes: installation.financeNotes || '',
        location: installation.location || '-',
        siteDetails: installation.siteDetails || {},
      };
    });

    // Transform new Maintenances
    const newMaintenancesData = newMaintenances.map((maintenance) => {
      const customerId = toCustomerId(maintenance.customerId);
      const populatedCustomer = maintenance.customerId && typeof maintenance.customerId === 'object' ? maintenance.customerId : null;
      const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

      return {
        ticketId: maintenance._id,
        productType: maintenance.productType || 'N/A',
        serviceType: 'Maintenance',
        serviceDescription: maintenance.scheduledServiceType || 'Scheduled Maintenance',
        fullName: customer?.fullName || maintenance.fullName || 'Unknown Customer',
        customerEmail: customer?.email || maintenance.customerEmail || '-',
        customerphoneNumber: customer?.phoneNumber || maintenance.customerPhone || '-',
        customerAddress: customer?.address || maintenance.location || '-',
        isUnderWarranty: true, // As per spec, first 4 are under warranty. Usually we pull this from somewhere, default true.
        isFreeOfCharge: true,
        requestType: 'Maintenance', // Treat as Maintenance in UI
        status: maintenance.status,
        note: maintenance.status === MAINTENANCE_STATUS.FINANCE_REJECTED ? 'Finance Rejected - Available for Re-submission' : 'New Maintenance - ready for material submission',
        materials: maintenance.materialList || [],
        financeNotes: '',
        location: maintenance.location || '-',
        siteDetails: {}
      };
    });

    // Combine all available tickets
    const data = [...newRequestsData, ...newInstallationsData, ...rejectedServiceRequestsData, ...rejectedInstallationsData, ...newMaintenancesData];

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.submitMaterialRequest = async (req, res) => {
  try {
    const { 
      newRequestId, 
      materials, 
      financeNotes, 
      isFreeOfCharge, 
      isUnderWarranty,
      fullName,
      customerEmail,
      customerphoneNumber,
      customerAddress
    } = req.body;
    
    // Remove '#' prefix if present (from UI display format)
    const resolvedId = String(newRequestId || '').replace(/^#/, '');

    // First, check if this is a resubmission (Finance Rejected status)
    const existingServiceRequest = await ServiceRequest.findById(resolvedId).lean();
    const existingInstallation = await Installation.findById(resolvedId).lean();
    const existingMaintenance = await Maintenance.findById(resolvedId).lean();

    if (existingMaintenance && [MAINTENANCE_STATUS.NEW, MAINTENANCE_STATUS.FINANCE_REJECTED].includes(existingMaintenance.status)) {
      // MAINTENANCE FLOW: Update Maintenance with new materials and move to PENDING
      const updatedRequest = await Maintenance.findByIdAndUpdate(
        resolvedId,
        {
          materialList: materials,
          totalEstimatedCost: 0, // Should calculate, but 0 is fine for now
          status: MAINTENANCE_STATUS.PENDING
        },
        { new: true }
      );

      return res.json({ 
        success: true, 
        message: existingMaintenance.status === MAINTENANCE_STATUS.NEW
          ? "Maintenance material request submitted to Finance"
          : "Maintenance material request resubmitted to Finance",
        data: {
          serviceRequestId: resolvedId,
          requestType: REQUEST_TYPES.SERVICE,
          resubmission: existingMaintenance.status === MAINTENANCE_STATUS.FINANCE_REJECTED,
          status: MAINTENANCE_STATUS.PENDING
        }
      });
    }

    let sourceDoc = existingServiceRequest || existingInstallation;
    let isResubmission = false;

    // If not found in ServiceRequest or Installation, try NewRequest
    if (!sourceDoc) {
      sourceDoc = await NewRequest.findById(resolvedId).lean();
      if (!sourceDoc) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }
    } else {
      // This is a resubmission of a rejected request
      isResubmission = true;
    }

    if (isResubmission && existingServiceRequest?.status === WORKFLOW_STATUS.FINANCE_REJECTED) {
      // RESUBMISSION: Update existing ServiceRequest with new materials
      // Reset status to 'Pending' for new Finance review
      
      const updatedRequest = await ServiceRequest.findByIdAndUpdate(
        resolvedId,
        {
          materials,
          financeNotes,
          isUnderWarranty,
          isFreeOfCharge,
          status: WORKFLOW_STATUS.PENDING
        },
        { new: true }
      );

      return res.json({ 
        success: true, 
        message: "Material request resubmitted to Finance",
        data: {
          serviceRequestId: resolvedId,
          warrantyStatus: isUnderWarranty ? 'Under Warranty' : 'Out of Warranty',
          freeOfCharge: isFreeOfCharge,
          resubmission: true,
          status: WORKFLOW_STATUS.PENDING
        }
      });
    }

    if (
      existingInstallation &&
      [WORKFLOW_STATUS.FINANCE_REJECTED, WORKFLOW_STATUS.NEW].includes(existingInstallation.status)
    ) {
      // INSTALLATION FLOW: New or rejected installation moves to Pending on material submission.
      
      const updatedRequest = await Installation.findByIdAndUpdate(
        resolvedId,
        {
          materials,
          financeNotes,
          status: WORKFLOW_STATUS.PENDING
        },
        { new: true }
      );

      return res.json({ 
        success: true, 
        message: existingInstallation.status === WORKFLOW_STATUS.NEW
          ? "Installation material request submitted to Finance"
          : "Material request resubmitted to Finance",
        data: {
          serviceRequestId: resolvedId,
          requestType: REQUEST_TYPES.INSTALLATION,
          resubmission: existingInstallation.status === WORKFLOW_STATUS.FINANCE_REJECTED,
          status: WORKFLOW_STATUS.PENDING
        }
      });
    }

    // NEW SUBMISSION: Create new ServiceRequest or Maintenance from NewRequest
    const derivedServiceType = sourceDoc.serviceType || sourceDoc.requestType || sourceDoc.request_type || 'Repair';

      let resolvedCustomerId = sourceDoc.customerId;
      let resolvedfullName = sourceDoc.fullName || (fullName !== DEFAULTS.UNKNOWN_CUSTOMER ? fullName : null);
      let resolvedCustomerEmail = sourceDoc.customerEmail || (customerEmail !== '-' ? customerEmail : null);
      let resolvedCustomerPhone = sourceDoc.customerPhone || sourceDoc.customerphoneNumber || (customerphoneNumber !== '-' ? customerphoneNumber : null);
      let resolvedLocation = sourceDoc.location || sourceDoc.customerAddress || (customerAddress !== '-' ? customerAddress : null);

      if (resolvedCustomerId && (!resolvedfullName || !resolvedCustomerEmail || !resolvedCustomerPhone)) {
        const Customer = require('../../user/user.model');
        const cust = await Customer.findById(resolvedCustomerId).lean();
        if (cust) {
          if (!resolvedfullName) resolvedfullName = cust.fullName;
          if (!resolvedCustomerEmail) resolvedCustomerEmail = cust.email;
          if (!resolvedCustomerPhone) resolvedCustomerPhone = cust.phoneNumber;
          if (!resolvedLocation) resolvedLocation = cust.address;
        }
      }

      await NewRequest.findByIdAndUpdate(resolvedId, {
        $set: {
          fullName: resolvedfullName,
          customerEmail: resolvedCustomerEmail,
          customerPhone: resolvedCustomerPhone,
          location: resolvedLocation,
          materials,
          financeNotes,
          isUnderWarranty,
          isFreeOfCharge,
          status: 'Pending',
          pendingServiceType: derivedServiceType,
          serviceDescription: sourceDoc.serviceDescription || sourceDoc.description || sourceDoc.problemDescription || sourceDoc.subject
        }
      });    

    res.json({ 
      success: true, 
      message: "Material request submitted to Finance",
        data: {
        serviceRequestId: resolvedId,
        requestType: derivedServiceType === 'Maintenance' ? 'Maintenance' : 'Repair',
        warrantyStatus: isUnderWarranty ? 'Under Warranty' : 'Out of Warranty',
        freeOfCharge: isFreeOfCharge,
        status: derivedServiceType === 'Maintenance' ? MAINTENANCE_STATUS.PENDING : WORKFLOW_STATUS.PENDING
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.sendToFinance = exports.submitMaterialRequest;


exports.sendToInventoryManager = async (req, res) => {
  try {
    console.log("HIT sendToInventoryManager with ID:", req.params.id);
    // Remove '#' prefix if present (from UI display format)
    const resolvedId = String(req.params.id || '').replace(/^#/, '');
    const { 
      fullName, 
      customerEmail, 
      customerphoneNumber, 
      location, 
      materials 
    } = req.body;
    
    // Support ServiceRequest, Installation, and Maintenance so they all follow the same workflow behavior.
    let sourceRecord = await ServiceRequest.findById(resolvedId).lean();
    let requestType = REQUEST_TYPES.SERVICE;

    if (!sourceRecord) {
      sourceRecord = await Installation.findById(resolvedId).lean();
      requestType = REQUEST_TYPES.INSTALLATION;
    }

    if (!sourceRecord) {
      sourceRecord = await Maintenance.findById(resolvedId).lean();
      requestType = 'Maintenance';
    }

    if (!sourceRecord) {
      const newReq = await NewRequest.findById(resolvedId).lean();
      if (newReq) {
        sourceRecord = newReq;
        requestType = (newReq.requestType || newReq.serviceType || 'Repair').toLowerCase() === 'maintenance' 
          ? 'Maintenance' : (newReq.requestType || newReq.serviceType || 'Repair').toLowerCase() === 'installation' 
          ? REQUEST_TYPES.INSTALLATION : REQUEST_TYPES.SERVICE;
        
        // Migrate it to the appropriate collection now that we are sending to IM
        let newEntry;
        const docObj = { ...newReq, status: WORKFLOW_STATUS.SENT_TO_IM };
        if (requestType === 'Maintenance') {
          newEntry = new Maintenance({ ...docObj, materialList: newReq.materials || [], totalEstimatedCost: 0 });
        } else if (requestType === REQUEST_TYPES.INSTALLATION) {
          newEntry = new Installation(docObj);
        } else {
          newEntry = new ServiceRequest(docObj);
        }
        await newEntry.save({ validateBeforeSave: false });
        await NewRequest.findByIdAndDelete(resolvedId);
        sourceRecord = docObj; // Use the migrated object moving forward
      }
    }

    if (!sourceRecord) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const items = (materials || sourceRecord.materials || sourceRecord.materialList || []).map(m => ({
      itemName: m.item || m.itemName || '',
      quantity: Number(m.quantity) || 0,
      unitPrice: m.unitPrice || 0,
      total: m.total || 0
    }));

    const jobMaterial = new JobMaterialRequest({
      jobId: resolvedId,
      jobType: requestType,
      requestedBy: req.user ? req.user._id : null,
      items: items,
      status: 'PENDING'
    });
    await jobMaterial.save();

    let updatedRecord = await ServiceRequest.findByIdAndUpdate(
      resolvedId,
      { status: WORKFLOW_STATUS.SENT_TO_IM },
      { new: true }
    );

    if (!updatedRecord) {
      updatedRecord = await Installation.findByIdAndUpdate(
        resolvedId,
        { status: WORKFLOW_STATUS.SENT_TO_IM },
        { new: true }
      );
    }

    if (!updatedRecord) {
      updatedRecord = await Maintenance.findByIdAndUpdate(
        resolvedId,
        { status: MAINTENANCE_STATUS.SENT_TO_IM },
        { new: true }
      );
    }

    res.json({ 
      success: true, 
      message: 'Material request sent to Inventory Manager',
      data: {
        serviceRequestId: resolvedId,
        requestType,
        status: WORKFLOW_STATUS.SENT_TO_IM,
        location: location || sourceRecord.location || '-',
        materials: materials || sourceRecord.materials || sourceRecord.materialList || [],
        sentAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Finance Approval: Approve the material request
exports.approveFinance = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').replace(/^#/, '');
    
    // Try updating ServiceRequest
    let updated = await ServiceRequest.findByIdAndUpdate(
      ticketId,
      { status: WORKFLOW_STATUS.FINANCE_APPROVED },
      { new: true }
    );

    // If not found, try Installation
    if (!updated) {
      updated = await Installation.findByIdAndUpdate(
        ticketId,
        { status: WORKFLOW_STATUS.FINANCE_APPROVED },
        { new: true }
      );
    }

    if (!updated) {
      updated = await Maintenance.findByIdAndUpdate(
        ticketId,
        { status: MAINTENANCE_STATUS.FINANCE_APPROVED },
        { new: true }
      );
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.json({
      success: true,
      message: 'Material request approved by Finance',
      data: {
        ticketId,
        status: WORKFLOW_STATUS.FINANCE_APPROVED,
        updatedAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Finance Rejection: Reject the material request (allows re-submission)
exports.rejectFinance = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').replace(/^#/, '');
    const { reason } = req.body;

    // Try updating ServiceRequest
    let updated = await ServiceRequest.findByIdAndUpdate(
      ticketId,
      { 
        status: WORKFLOW_STATUS.FINANCE_REJECTED,
        financeNotes: reason || 'Rejected by Finance'
      },
      { new: true }
    );

    // If not found, try Installation
    if (!updated) {
      updated = await Installation.findByIdAndUpdate(
        ticketId,
        { 
          status: WORKFLOW_STATUS.FINANCE_REJECTED,
          financeNotes: reason || 'Rejected by Finance'
        },
        { new: true }
      );
    }

    if (!updated) {
      updated = await Maintenance.findByIdAndUpdate(
        ticketId,
        { 
          status: MAINTENANCE_STATUS.FINANCE_REJECTED,
          financeNotes: reason || 'Rejected by Finance'
        },
        { new: true }
      );
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.json({
      success: true,
      message: 'Material request rejected by Finance. Available for re-submission in the dropdown.',
      data: {
        ticketId,
        status: WORKFLOW_STATUS.FINANCE_REJECTED,
        reason: reason || 'Rejected by Finance',
        resubmissionAvailable: true,
        updatedAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Cancel: Cancel the material request and associated service request/installation
exports.cancelMaterialRequest = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').replace(/^#/, '');
    const { reason } = req.body;

    // Try updating ServiceRequest
    let updated = await ServiceRequest.findByIdAndUpdate(
      ticketId,
      { 
        status: WORKFLOW_STATUS.CANCELLED,
        financeNotes: reason || WORKFLOW_STATUS.CANCELLED
      },
      { new: true }
    );

    // If not found, try Installation
    if (!updated) {
      updated = await Installation.findByIdAndUpdate(
        ticketId,
        { 
          status: WORKFLOW_STATUS.CANCELLED,
          financeNotes: reason || WORKFLOW_STATUS.CANCELLED
        },
        { new: true }
      );
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.json({
      success: true,
      message: 'Material request cancelled. Associated service request/installation has been stopped.',
      data: {
        ticketId,
        status: WORKFLOW_STATUS.CANCELLED,
        reason: reason || WORKFLOW_STATUS.CANCELLED,
        workflow_stopped: true,
        updatedAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};





// --- Migrated from routes ---
exports.getNewRequests = async (req, res) => {
    try {
        const materialWorkflowStatusRegex = [
            new RegExp(`^\\s*${WORKFLOW_STATUS.PENDING}\\s*$`, 'i'),
            new RegExp(`^\\s*${WORKFLOW_STATUS.FINANCE_APPROVED}\\s*$`, 'i'),
            new RegExp(`^\\s*${WORKFLOW_STATUS.FINANCE_REJECTED}\\s*$`, 'i')
        ];
        const toCustomerId = (value) => {
            if (!value) return null;
            if (typeof value === 'string') return value;
            if (typeof value === 'object') {
                if (value._id) return String(value._id);
                if (value.id) return String(value.id);
            }
            return String(value);
        };

        // 1. Get ServiceRequests and normalize status in application code.
        const serviceRequests = await ServiceRequest.find({
            status: { $in: materialWorkflowStatusRegex }
        })
            .populate('customerId', 'fullName email phoneNumber address')
            .sort({ createdAt: -1 })
            .lean();

        // 1b. Get Installations in the same materials workflow statuses.
        const installations = await Installation.collection.find({
            status: { $in: STATUS_GROUPS.MATERIAL_WORKFLOW_VISIBLE }
        }).sort({ createdAt: -1 }).toArray();

        // 1c. Get Maintenances in the materials workflow statuses
        const materialMaintenanceStatusRegex = [
            new RegExp(`^\\s*${MAINTENANCE_STATUS.PENDING}\\s*$`, 'i'),
            new RegExp(`^\\s*${MAINTENANCE_STATUS.FINANCE_APPROVED}\\s*$`, 'i'),
            new RegExp(`^\\s*${MAINTENANCE_STATUS.FINANCE_REJECTED}\\s*$`, 'i')
        ];
        const maintenances = await Maintenance.find({
            status: { $in: materialMaintenanceStatusRegex }
        })
            .populate('customerId', 'fullName email phoneNumber address')
            .sort({ createdAt: -1 })
            .lean();

        // 2. Get NewRequests (Status: New) and calculate warranty
        const newRequests = await NewRequest.find()
            .populate('customerId', 'fullName email phoneNumber address')
            .lean();

        // Build a reliable customer map for cases where customerId is present but not fully populated.
        const customerIds = Array.from(new Set([
            ...serviceRequests.map((item) => toCustomerId(item.customerId)),
            ...installations.map((item) => toCustomerId(item.customerId)),
            ...maintenances.map((item) => toCustomerId(item.customerId)),
            ...newRequests.map((item) => toCustomerId(item.customerId))
        ].filter(Boolean)));

        const customers = customerIds.length > 0
            ? await Customer.find({ _id: { $in: customerIds } }).lean()
            : [];
        const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));

        const serviceRequestsFormatted = serviceRequests
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: item.serviceType || 'Repair'
                };
            });

        const installationsFormatted = installations
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: REQUEST_TYPES.INSTALLATION
                };
            });

        const newRequestsFormatted = await Promise.all(newRequests.map(async (req) => {
            const customerId = toCustomerId(req.customerId);
            const populatedCustomer = req.customerId && typeof req.customerId === 'object' ? req.customerId : null;
            const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
            const customerObjectId = customerId || req.customerId;

            // Calculate warranty status for this customer
            const { isUnderWarranty, isFreeOfCharge } = await calculateWarrantyStatus(customerObjectId);

            return {
                ...req,
                ticketId: req._id,
                customerName: customer?.fullName || req.customerName || req.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                customerEmail: customer?.email || req.customerEmail || '-',
                customerContactNo: customer?.phoneNumber || req.customerContactNo || req.customerPhone || '-',
                location: customer?.address || req.location || req.customerAddress || '-',
                    status: req.status || WORKFLOW_STATUS.NEW,
                    serviceType: req.serviceType || req.requestType || req.request_type || 'Repair',
                    requestType: req.serviceType === 'Maintenance' ? 'Maintenance' : 'Repair',
                isUnderWarranty,
                isFreeOfCharge
            };
        }));

        const maintenancesFormatted = maintenances
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: 'Maintenance',
        resubmissionAvailable: true,
        updatedAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Cancel: Cancel the material request and associated service request/installation
exports.cancelMaterialRequest = async (req, res) => {
  try {
    const ticketId = String(req.params.id || '').replace(/^#/, '');
    const { reason } = req.body;

    // Try updating ServiceRequest
    let updated = await ServiceRequest.findByIdAndUpdate(
      ticketId,
      { 
        status: WORKFLOW_STATUS.CANCELLED,
        financeNotes: reason || WORKFLOW_STATUS.CANCELLED
      },
      { new: true }
    );

    // If not found, try Installation
    if (!updated) {
      updated = await Installation.findByIdAndUpdate(
        ticketId,
        { 
          status: WORKFLOW_STATUS.CANCELLED,
          financeNotes: reason || WORKFLOW_STATUS.CANCELLED
        },
        { new: true }
      );
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.json({
      success: true,
      message: 'Material request cancelled. Associated service request/installation has been stopped.',
      data: {
        ticketId,
        status: WORKFLOW_STATUS.CANCELLED,
        reason: reason || WORKFLOW_STATUS.CANCELLED,
        workflow_stopped: true,
        updatedAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};





// --- Migrated from routes ---
exports.getNewRequests = async (req, res) => {
    try {
        const materialWorkflowStatusRegex = [
            new RegExp(`^\\s*${WORKFLOW_STATUS.PENDING}\\s*$`, 'i'),
            new RegExp(`^\\s*${WORKFLOW_STATUS.FINANCE_APPROVED}\\s*$`, 'i'),
            new RegExp(`^\\s*${WORKFLOW_STATUS.FINANCE_REJECTED}\\s*$`, 'i')
        ];
        const toCustomerId = (value) => {
            if (!value) return null;
            if (typeof value === 'string') return value;
            if (typeof value === 'object') {
                if (value._id) return String(value._id);
                if (value.id) return String(value.id);
            }
            return String(value);
        };

        // 1. Get ServiceRequests and normalize status in application code.
        const serviceRequests = await ServiceRequest.find({
            status: { $in: materialWorkflowStatusRegex }
        })
            .populate('customerId', 'fullName email phoneNumber address')
            .sort({ createdAt: -1 })
            .lean();

        // 1b. Get Installations in the same materials workflow statuses.
        const installations = await Installation.collection.find({
            status: { $in: STATUS_GROUPS.MATERIAL_WORKFLOW_VISIBLE }
        }).sort({ createdAt: -1 }).toArray();

        // 1c. Get Maintenances in the materials workflow statuses
        const materialMaintenanceStatusRegex = [
            new RegExp(`^\\s*${MAINTENANCE_STATUS.PENDING}\\s*$`, 'i'),
            new RegExp(`^\\s*${MAINTENANCE_STATUS.FINANCE_APPROVED}\\s*$`, 'i'),
            new RegExp(`^\\s*${MAINTENANCE_STATUS.FINANCE_REJECTED}\\s*$`, 'i')
        ];
        const maintenances = await Maintenance.find({
            status: { $in: materialMaintenanceStatusRegex }
        })
            .populate('customerId', 'fullName email phoneNumber address')
            .sort({ createdAt: -1 })
            .lean();

        // 2. Get NewRequests (Status: New) and calculate warranty
        const newRequests = await NewRequest.find()
            .populate('customerId', 'fullName email phoneNumber address')
            .lean();

        // Build a reliable customer map for cases where customerId is present but not fully populated.
        const customerIds = Array.from(new Set([
            ...serviceRequests.map((item) => toCustomerId(item.customerId)),
            ...installations.map((item) => toCustomerId(item.customerId)),
            ...maintenances.map((item) => toCustomerId(item.customerId)),
            ...newRequests.map((item) => toCustomerId(item.customerId))
        ].filter(Boolean)));

        const customers = customerIds.length > 0
            ? await Customer.find({ _id: { $in: customerIds } }).lean()
            : [];
        const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));

        const serviceRequestsFormatted = serviceRequests
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: item.serviceType || 'Repair'
                };
            });

        const installationsFormatted = installations
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: REQUEST_TYPES.INSTALLATION
                };
            });

        const newRequestsFormatted = await Promise.all(newRequests.map(async (req) => {
            const customerId = toCustomerId(req.customerId);
            const populatedCustomer = req.customerId && typeof req.customerId === 'object' ? req.customerId : null;
            const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
            const customerObjectId = customerId || req.customerId;

            // Calculate warranty status for this customer
            const { isUnderWarranty, isFreeOfCharge } = await calculateWarrantyStatus(customerObjectId);

            return {
                ...req,
                ticketId: req._id,
                customerName: customer?.fullName || req.customerName || req.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                customerEmail: customer?.email || req.customerEmail || '-',
                customerContactNo: customer?.phoneNumber || req.customerContactNo || req.customerPhone || '-',
                location: customer?.address || req.location || req.customerAddress || '-',
                    status: req.status || WORKFLOW_STATUS.NEW,
                    serviceType: req.serviceType || req.requestType || req.request_type || 'Repair',
                    requestType: req.serviceType === 'Maintenance' ? 'Maintenance' : 'Repair',
                isUnderWarranty,
                isFreeOfCharge
            };
        }));

        const maintenancesFormatted = maintenances
            .map((item) => {
                const customerId = toCustomerId(item.customerId);
                const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
                const customer = (customerId && customerById.get(customerId)) || populatedCustomer;

                return {
                    ...item,
                    ticketId: item._id,
                    customerName: customer?.fullName || item.customerName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
                    customerEmail: customer?.email || item.customerEmail || '-',
                    customerContactNo: customer?.phoneNumber || item.customerContactNo || item.customerPhone || '-',
                    location: customer?.address || item.location || item.customerAddress || '-',
                    requestType: 'Maintenance',
                    serviceType: 'Maintenance',
                    materials: item.materialList || []
                };
            });

        const allRequests = [...serviceRequestsFormatted, ...installationsFormatted, ...newRequestsFormatted, ...maintenancesFormatted]
            .filter(req => {
                const s = (req.status || '').trim().toLowerCase();
                return ['new', 'pending', 'finance approved', 'finance rejected'].includes(s);
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, data: allRequests });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
const { body, validationResult } = require('express-validator');

// Insert this specific validation chain
exports.validateMaterialSubmission = [
  body('newRequestId').notEmpty().withMessage('Ticket ID is required'),
  body('materials').isArray({ min: 1 }).withMessage('At least one material is required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
  }
];

// Apply it here:
