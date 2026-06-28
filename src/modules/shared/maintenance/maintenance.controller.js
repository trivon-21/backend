const Maintenance = require('./maintenance.model');
const MaintenanceSchedule = require('./maintenanceSchedule.model');
const Installation = require('../installation/installation.model');
const ServiceRequest = require('../serviceRequest/serviceRequest.model');
const { 
  MAINTENANCE_SCHEDULE_STATUS, 
  MAINTENANCE_STATUS,
  INSTALLATION_MAINTENANCE_STATUS
} = require('../../../constants/enums');

// A. Triggered automatically when an Installation status updates to 'Completed' (via DB hook)
exports.handleInstallationCompletion = async (installationId) => {
  // Logic handled by the pre-save hook in installation.model.js
  return;
};

// A2. GET: Fetch a single schedule by ID
exports.getScheduleById = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const schedule = await MaintenanceSchedule.findById(scheduleId).lean();
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });
    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// B. GET: Fetch schedules matching any state variant
exports.getAllSchedules = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'All') query.status = status;

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { ticketId: searchRegex },
        { customerName: searchRegex },
        { location: searchRegex }
      ];
    }

    const schedules = await MaintenanceSchedule.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: schedules.length, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// C. POST: Save intermediate calendar draft (allowed from 'New' or 'Draft Saved' statuses only)
exports.saveDraft = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { services } = req.body;

    const schedule = await MaintenanceSchedule.findById(scheduleId);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    // Only allow saving a draft from 'New' or 'Draft Saved' status
    if (
      schedule.status !== MAINTENANCE_SCHEDULE_STATUS.NEW &&
      schedule.status !== MAINTENANCE_SCHEDULE_STATUS.DRAFT_SAVED
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot save draft: schedule is locked at status '${schedule.status}'.`
      });
    }

    schedule.services = services;
    // Transition from 'New' to 'Draft Saved' on first save; keep 'Draft Saved' if already a draft
    schedule.status = MAINTENANCE_SCHEDULE_STATUS.DRAFT_SAVED;
    await schedule.save();

    res.json({ success: true, message: 'Draft saved successfully.', data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// D. POST: Finalize and lock schedule for CSA evaluation (allowed from 'New' or 'Draft Saved' status)
exports.sendScheduleToCsa = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { services, csaNotes } = req.body;

    const schedule = await MaintenanceSchedule.findById(scheduleId);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    // Allow sending to CSA from 'Draft Saved' status only
    // (User must save draft first to lock in the dates)
    if (
      schedule.status !== MAINTENANCE_SCHEDULE_STATUS.DRAFT_SAVED &&
      schedule.status !== MAINTENANCE_SCHEDULE_STATUS.NEW
    ) {
      return res.status(400).json({
        success: false,
        message: `Cannot send to CSA: schedule must be in 'New' or 'Draft Saved' status. Current status: '${schedule.status}'.`
      });
    }

    if (services) schedule.services = services;
    schedule.status = MAINTENANCE_SCHEDULE_STATUS.SENT_TO_CSA;
    schedule.sentToCsaAt = Date.now();
    if (csaNotes) schedule.csaNotes = csaNotes;

    await schedule.save();

    await Installation.findByIdAndUpdate(schedule.installationId, { 
      maintenanceStatus: INSTALLATION_MAINTENANCE_STATUS.SENT_TO_CSA 
    });

    res.json({ success: true, message: 'Schedule locked and dispatched onto CSA queue.', data: schedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// E. POST: Dispatch Schedule to Customer (only allowed from 'Sent to CSA' status)
exports.sendScheduleToCustomer = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { customerNotes } = req.body;

    const schedule = await MaintenanceSchedule.findById(scheduleId);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found' });

    // Guard: only allow sending to customer when schedule is already with CSA
    if (schedule.status !== MAINTENANCE_SCHEDULE_STATUS.SENT_TO_CSA) {
      return res.status(400).json({
        success: false,
        message: `Cannot send to customer: schedule must be in 'Sent to CSA' status. Current status: '${schedule.status}'.`
      });
    }

    const updatedSchedule = await MaintenanceSchedule.findByIdAndUpdate(
      scheduleId,
      {
        status: MAINTENANCE_SCHEDULE_STATUS.SENT_TO_CUSTOMER,
        sentToCustomerAt: Date.now(),
        customerNotes,
        updatedAt: Date.now()
      },
      { new: true }
    );

    await Installation.findByIdAndUpdate(updatedSchedule.installationId, { 
      maintenanceStatus: INSTALLATION_MAINTENANCE_STATUS.SENT_TO_CUSTOMER 
    });

    res.json({ success: true, message: 'Schedule marked as dispatched to customer.', data: updatedSchedule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// F. POST: Create active Maintenance Execution Record (Replaces Quotation/Reminder logic)
exports.createActiveMaintenance = async (req, res) => {
  try {
    const { scheduleId, serviceName, serviceDate, materialList, totalEstimatedCost } = req.body;

    const schedule = await MaintenanceSchedule.findById(scheduleId);
    if (!schedule) return res.status(404).json({ success: false, message: 'Source schedule not found.' });

    const activeJob = new Maintenance({
      ticketId: `${schedule.ticketId}-ACT`, // Appends ACT to show it is active
      maintenanceScheduleId: schedule._id,
      customerId: schedule.customerId,
      customerName: schedule.customerName,
      customerEmail: schedule.customerEmail,
      customerPhone: schedule.customerPhone,
      productType: schedule.productType,
      location: schedule.location,
      date: serviceDate || Date.now(),
      scheduledServiceType: serviceName,
      maintenanceType: 'Company Initiated',
      isCustomerInitiated: false,
      status: MAINTENANCE_STATUS.NEW, // Lands on Material Requests dropdown
      materialList: materialList && materialList.length > 0 ? materialList : [
        { item: 'Air Filter', quantity: '1', estimatedCost: 0 },
        { item: 'Refrigerant cylinder', quantity: '1', estimatedCost: 0 }
      ],
      totalEstimatedCost: totalEstimatedCost || 0
    });

    await activeJob.save();

    res.json({ success: true, message: 'Active maintenance created under Finance Approved status.', data: activeJob });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// G. GET: General workflow tracking endpoint (Materials Tab / Team Allocation / Execution Monitoring)
exports.getAllMaintenance = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};
    const executionStatuses = [
      MAINTENANCE_STATUS.ASSIGNED,
      MAINTENANCE_STATUS.SCHEDULED,
      MAINTENANCE_STATUS.IN_PROGRESS,
      MAINTENANCE_STATUS.ON_HOLD,
      MAINTENANCE_STATUS.COMPLETED
    ];

    if (status && status !== 'All') {
      query.status = status;
    } else {
      query.status = { $in: executionStatuses };
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ ticketId: searchRegex }, { customerName: searchRegex }, { productType: searchRegex }];
    }

    const tickets = await Maintenance.find(query)
      .populate('customerId')
      .populate('assignedTeamId')
      .sort({ date: 1 })
      .lean();

    const mappedTickets = tickets.map(ticket => ({
      ...ticket,
      isCustomerInitiated: ticket.maintenanceType === 'Customer Initiated' || ticket.isCustomerInitiated || false,
      maintenanceType: ticket.maintenanceType || (ticket.isCustomerInitiated ? 'Customer Initiated' : 'Company Initiated')
    }));

    // Also fetch customer-initiated maintenance from ServiceRequest
    const srQuery = { serviceType: 'Maintenance', ...query };
    const srTickets = await ServiceRequest.find(srQuery)
      .populate('customerId')
      .populate('assignedTeam')
      .sort({ serviceDate: 1, createdAt: 1 })
      .lean();

    // Map ServiceRequest to match Maintenance ticket shape for UI
    const mappedSrTickets = srTickets.map(sr => ({
      _id: sr._id,
      ticketId: sr._id,
      customerId: sr.customerId,
      customerName: sr.customerId?.name || sr.customerName || 'Unknown',
      customerEmail: sr.customerId?.email || sr.customerEmail || '',
      customerPhone: sr.customerId?.contactNo || sr.customerPhone || '',
      productType: sr.productType || 'Customer Initiated',
      location: sr.location || '',
      date: sr.serviceDate || sr.createdAt,
      scheduledServiceType: sr.serviceDescription || 'Maintenance',
      status: sr.status,
      materialList: sr.materials || [],
      totalEstimatedCost: 0,
      assignedTeam: sr.assignedTeam?.teamName || sr.assignedTeamName,
      assignedTeamId: sr.assignedTeamId || (sr.assignedTeam ? sr.assignedTeam._id : null),
      createdAt: sr.createdAt,
      updatedAt: sr.updatedAt,
      isCustomerInitiated: true,
      maintenanceType: 'Customer Initiated'
    }));

    const combined = [...mappedTickets, ...mappedSrTickets];
    // Sort combined array
    combined.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    res.json({ success: true, count: combined.length, data: combined });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// G2. GET: Fetch a single maintenance or service request ticket by ID
exports.getMaintenanceById = async (req, res) => {
  try {
    const { maintenanceId } = req.params;
    
    // First try Maintenance collection
    let ticket = await Maintenance.findById(maintenanceId)
      .populate('customerId')
      .populate('assignedTeamId')
      .lean();
      
    if (ticket) {
      ticket.isCustomerInitiated = ticket.maintenanceType === 'Customer Initiated' || ticket.isCustomerInitiated || false;
      ticket.maintenanceType = ticket.maintenanceType || (ticket.isCustomerInitiated ? 'Customer Initiated' : 'Company Initiated');
      return res.json({ success: true, data: ticket });
    }

    // Fallback: try ServiceRequest collection
    let srTicket = await ServiceRequest.findById(maintenanceId)
      .populate('customerId')
      .populate('assignedTeam')
      .lean();
      
    if (srTicket) {
      const mappedSrTicket = {
        _id: srTicket._id,
        ticketId: srTicket._id,
        customerId: srTicket.customerId,
        customerName: srTicket.customerId?.name || srTicket.customerName || 'Unknown',
        customerEmail: srTicket.customerId?.email || srTicket.customerEmail || '',
        customerPhone: srTicket.customerId?.contactNo || srTicket.customerPhone || '',
        productType: srTicket.productType || 'Customer Initiated',
        location: srTicket.location || '',
        date: srTicket.serviceDate || srTicket.createdAt,
        scheduledServiceType: srTicket.serviceDescription || 'Maintenance',
        status: srTicket.status,
        materialList: srTicket.materials || [],
        totalEstimatedCost: 0,
        assignedTeam: srTicket.assignedTeam?.teamName || srTicket.assignedTeamName,
        assignedTeamId: srTicket.assignedTeamId || (srTicket.assignedTeam ? srTicket.assignedTeam._id : null),
        assignedTeamData: srTicket.assignedTeam || null,
        createdAt: srTicket.createdAt,
        updatedAt: srTicket.updatedAt,
        isCustomerInitiated: true,
        maintenanceType: 'Customer Initiated',
        serviceHistory: [] // Future scope
      };
      return res.json({ success: true, data: mappedSrTicket });
    }

    return res.status(404).json({ success: false, message: 'Maintenance record not found' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// H. POST: Forward stock parameters from Materials view onwards to the Inventory Manager
exports.sendMaterialListToInventoryManager = async (req, res) => {
  try {
    const { maintenanceId } = req.params;

    const maintenance = await Maintenance.findByIdAndUpdate(
      maintenanceId,
      {
        status: MAINTENANCE_STATUS.SENT_TO_IM,
        sentToInventoryManagerAt: Date.now(),
        updatedAt: Date.now()
      },
      { new: true }
    );

    if (!maintenance) return res.status(404).json({ success: false, message: 'Maintenance record missing' });

    res.json({ success: true, message: 'Materials submitted to IM.', data: maintenance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// I. POST: Map Team Allocation assets
exports.assignTeamToMaintenance = async (req, res) => {
  try {
    const { maintenanceId } = req.params;
    const { teamId, teamName } = req.body;

    const maintenance = await Maintenance.findByIdAndUpdate(
      maintenanceId,
      {
        status: MAINTENANCE_STATUS.SCHEDULED,
        assignedTeamId: teamId,
        assignedTeam: teamName,
        updatedAt: Date.now()
      },
      { new: true }
    ).populate('assignedTeamId');

    if (!maintenance) return res.status(404).json({ success: false, message: 'Maintenance record not found' });

    res.json({ success: true, message: 'Crew allocated successfully.', data: maintenance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};