// src/controllers/materialRequest.controller.js
const NewRequest = require('../shared/serviceRequest/NewRequest');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const Installation = require('../shared/installation/Installation');
const Customer = require('../customer/customer.model');

exports.getNewServiceTickets = async (req, res) => {
  try {
  
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
      .populate('customerId', 'name email contactNo address')
      .lean();

    // Fetch ServiceRequests with 'Finance Rejected' status (can be recreated)
    const rejectedServiceRequests = await ServiceRequest.find({ status: 'Finance Rejected' })
      .populate('customerId', 'name email contactNo address')
      .lean();

    // Fetch Installations with 'Finance Rejected' status (can be recreated)
    const rejectedInstallations = await Installation.find({ status: 'Finance Rejected' })
      .populate('customerId', 'name email contactNo address')
      .lean();

    // Build customer lookup map to avoid N+1 queries
    const customerIds = Array.from(new Set(
      [
        ...newRequests,
        ...rejectedServiceRequests,
        ...rejectedInstallations
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
      let isUnderWarranty = false;
      let isFreeOfCharge = false;
      const customerId = toCustomerId(request.customerId);
      const populatedCustomer = request.customerId && typeof request.customerId === 'object' ? request.customerId : null;
      const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
      const customerObjectId = customerId || request.customerId;

      
      const installation = await Installation.findOne({
        customerId: customerObjectId,
        status: 'Completed'
      }).lean();

      if (installation) {
        // Calculate warranty period: 2 years
        const installDate = new Date(installation.serviceDate || installation.date);
        const warrantyExpiryDate = new Date(installDate);
        warrantyExpiryDate.setFullYear(warrantyExpiryDate.getFullYear() + 2);
        
        // Check if current date is within warranty period
        isUnderWarranty = new Date() <= warrantyExpiryDate;

        // Count services completed within warranty period (for free service eligibility)
        const completedWithinWarranty = await ServiceRequest.countDocuments({
          customerId: customerObjectId,
          status: 'Completed',
          createdAt: { $gte: installDate, $lte: warrantyExpiryDate }
        });

        // First 3 services are free
        isFreeOfCharge = isUnderWarranty && completedWithinWarranty < 3;
      }

      return {
        ticketId: request._id,
        productType: request.productType || 'N/A',
        serviceDescription: request.serviceDescription,
        customerName: customer?.name || 'Unknown Customer',
        customerEmail: customer?.email || '-',
        customerContactNo: customer?.contactNo || '-',
        customerAddress: customer?.address || '-',
        isUnderWarranty,
        isFreeOfCharge,
        requestType: 'Service',
        status: 'New',
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
        serviceDescription: request.serviceDescription,
        customerName: customer?.name || 'Unknown Customer',
        customerEmail: customer?.email || '-',
        customerContactNo: customer?.contactNo || '-',
        customerAddress: customer?.address || '-',
        isUnderWarranty: request.isUnderWarranty || false,
        isFreeOfCharge: request.isFreeOfCharge || false,
        requestType: 'Service',
        status: 'Finance Rejected',
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

      return {
        ticketId: installation._id,
        productType: installation.productType || 'N/A',
        serviceDescription: `Installation (${installation.productType || 'Product'})`,
        customerName: customer?.name || 'Unknown Customer',
        customerEmail: customer?.email || '-',
        customerContactNo: customer?.contactNo || '-',
        customerAddress: customer?.address || installation.location || '-',
        isUnderWarranty: false,
        isFreeOfCharge: false,
        requestType: 'Installation',
        status: 'Finance Rejected',
        note: 'Finance Rejected - Available for Re-submission',
        materials: installation.materials || [],
        financeNotes: installation.financeNotes || '',
        location: installation.location || '-'
      };
    });

    // Combine all available tickets
    const data = [...newRequestsData, ...rejectedServiceRequestsData, ...rejectedInstallationsData];

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
      customerName,
      customerEmail,
      customerContactNo,
      customerAddress
    } = req.body;
    
    // Remove '#' prefix if present (from UI display format)
    const resolvedId = String(newRequestId || '').replace(/^#/, '');

    // First, check if this is a resubmission (Finance Rejected status)
    const existingServiceRequest = await ServiceRequest.findById(resolvedId).lean();
    const existingInstallation = await Installation.findById(resolvedId).lean();

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

    if (isResubmission && existingServiceRequest?.status === 'Finance Rejected') {
      // RESUBMISSION: Update existing ServiceRequest with new materials
      // Reset status to 'Pending' for new Finance review
      
      const updatedRequest = await ServiceRequest.findByIdAndUpdate(
        resolvedId,
        {
          materials,
          financeNotes,
          isUnderWarranty,
          isFreeOfCharge,
          status: 'Pending'
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
          status: 'Pending'
        }
      });
    }

    if (isResubmission && existingInstallation?.status === 'Finance Rejected') {
      // RESUBMISSION: Update existing Installation with new materials
      // Reset status to 'Pending' for new Finance review
      
      const updatedRequest = await Installation.findByIdAndUpdate(
        resolvedId,
        {
          materials,
          financeNotes,
          status: 'Pending'
        },
        { new: true }
      );

      return res.json({ 
        success: true, 
        message: "Material request resubmitted to Finance",
        data: {
          serviceRequestId: resolvedId,
          resubmission: true,
          status: 'Pending'
        }
      });
    }

    // NEW SUBMISSION: Create new ServiceRequest from NewRequest
    // Create ServiceRequest with warranty status and customer details
    const serviceEntry = new ServiceRequest({
      ...sourceDoc,
      _id: sourceDoc._id, 
      materials,
      financeNotes,
      isUnderWarranty,
      isFreeOfCharge,
      status: 'Pending' // Initial state: awaiting finance approval
    });
    await serviceEntry.save();

    // Remove from NewRequest collection (workflow transition complete)
    await NewRequest.findByIdAndDelete(resolvedId);

    res.json({ 
      success: true, 
      message: "Material request submitted to Finance with service request ID: " + resolvedId,
      data: {
        serviceRequestId: resolvedId,
        warrantyStatus: isUnderWarranty ? 'Under Warranty' : 'Out of Warranty',
        freeOfCharge: isFreeOfCharge,
        status: 'Pending'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.sendToFinance = exports.submitMaterialRequest;


exports.sendToInventoryManager = async (req, res) => {
  try {
    // Remove '#' prefix if present (from UI display format)
    const resolvedId = String(req.params.id || '').replace(/^#/, '');
    const { 
      customerName, 
      customerEmail, 
      customerContactNo, 
      location, 
      materials 
    } = req.body;
    
    // Fetch the ServiceRequest to get customerId and other details
    const serviceRequest = await ServiceRequest.findById(resolvedId).lean();
    
    if (!serviceRequest) {
      return res.status(404).json({ success: false, message: 'Service request not found' });
    }

    // Update ServiceRequest status to 'Sent to IM'
    const updatedServiceRequest = await ServiceRequest.findByIdAndUpdate(
      resolvedId,
      { status: 'Sent to IM' },
      { new: true }
    );

    res.json({ 
      success: true, 
      message: 'Material request sent to Inventory Manager',
      data: {
        serviceRequestId: resolvedId,
        status: 'Sent to IM',
        location: location || serviceRequest.location || '-',
        materials: materials || serviceRequest.materials || [],
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
      { status: 'Finance Approved' },
      { new: true }
    );

    // If not found, try Installation
    if (!updated) {
      updated = await Installation.findByIdAndUpdate(
        ticketId,
        { status: 'Finance Approved' },
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
        status: 'Finance Approved',
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
        status: 'Finance Rejected',
        financeNotes: reason || 'Rejected by Finance'
      },
      { new: true }
    );

    // If not found, try Installation
    if (!updated) {
      updated = await Installation.findByIdAndUpdate(
        ticketId,
        { 
          status: 'Finance Rejected',
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
        status: 'Finance Rejected',
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
        status: 'Cancelled',
        financeNotes: reason || 'Cancelled'
      },
      { new: true }
    );

    // If not found, try Installation
    if (!updated) {
      updated = await Installation.findByIdAndUpdate(
        ticketId,
        { 
          status: 'Cancelled',
          financeNotes: reason || 'Cancelled'
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
        status: 'Cancelled',
        reason: reason || 'Cancelled',
        workflow_stopped: true,
        updatedAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};