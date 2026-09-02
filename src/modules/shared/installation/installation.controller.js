const mongoose = require('mongoose');
const Installation = require('./installation.model');
const Customer = require('../../user/user.model');
const TechTeam = require('../tech-teams/techTeam.model');

// ✅ FIXED PATH: Going up one level to 'shared' and into 'maintenance'
const MaintenanceSchedule = require('../maintenance/maintenanceSchedule.model');

const { 
  STATUS_GROUPS, 
  DEFAULTS, 
  EXECUTION_STATUS, 
  INSTALLATION_MAINTENANCE_STATUS,
  MAINTENANCE_SCHEDULE_STATUS 
} = require('../../../constants/enums');

// 1. GET all for the Installations Tab
exports.getAllInstallations = async (req, res) => {
  try {
    // Build query — if a specific status filter is provided, use it; otherwise fetch all
    const query = {};
    if (req.query.status && req.query.status !== 'All') {
      query.status = req.query.status;
    }

    const installations = await Installation.find(query)
      .populate('customerId', 'fullName name address')
      .lean();

    const toCustomerId = (value) => {
      if (!value) return null;
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        if (value._id) return String(value._id);
        if (value.id) return String(value.id);
      }
      return String(value);
    };

    // Collect customer IDs from both customerId and userId fields
    const customerIds = Array.from(new Set(
      installations
        .map((item) => toCustomerId(item.customerId) || (item.userId ? String(item.userId) : null))
        .filter(Boolean)
    ));

    const customers = customerIds.length > 0
      ? await Customer.find({ _id: { $in: customerIds } }).lean()
      : [];
    const customerById = new Map(customers.map((customer) => [String(customer._id), customer]));

    const teamIds = Array.from(new Set(
      installations
        .map((item) => item.assignedTeamId)
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value))
    ));

    const teams = teamIds.length > 0
      ? await TechTeam.collection.find({ _id: { $in: teamIds } }).toArray()
      : [];
    const teamById = new Map(teams.map((team) => [String(team._id), team]));

    const data = installations.map((item) => {
      const customerId = toCustomerId(item.customerId);
      const userId = item.userId ? String(item.userId) : null;
      const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
      const customer = (customerId && customerById.get(customerId))
        || (userId && customerById.get(userId))
        || populatedCustomer;
      const resolvedTeam = item.assignedTeamId ? teamById.get(String(item.assignedTeamId)) : null;
      const assignedTeamName = item.assignedTeamName
        || resolvedTeam?.teamName
        || item.assignedTeamRef?.teamName
        || (typeof item.assignedTeamRef === 'string' ? item.assignedTeamRef : null)
        || DEFAULTS.UNASSIGNED;

      // Derive customer fullName — from populated customer, shippingDetails, or fallback
      const shippingName = item.shippingDetails
        ? [item.shippingDetails.firstName, item.shippingDetails.lastName].filter(Boolean).join(' ')
        : null;
      const fullName = customer?.fullName || item.fullName || shippingName || DEFAULTS.UNKNOWN_CUSTOMER;

      // Derive location — from customer, shippingDetails, or existing field
      const shippingAddress = item.shippingDetails
        ? [item.shippingDetails.address, item.shippingDetails.city].filter(Boolean).join(', ')
        : null;
      const location = customer?.address || shippingAddress || item.location || '-';

      // Derive product type — from existing field or first item in items array
      const productType = item.productType
        || (item.items && item.items.length > 0 ? item.items[0].fullName || item.items[0].productId : null)
        || 'N/A';

      // Use orderId as ticketId if ticketId is missing
      const ticketId = item.serviceRequestId || item.serviceRequestRef || item.ticketId || item.orderId || item._id;

      return {
        ...item,
        ticketId,
        fullName,
        location,
        productType,
        assignedTeam: assignedTeamName,
        assignedTeamName
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 2. GET single installation with full customer details
exports.getInstallationById = async (req, res) => {
  try {
    const id = req.params.id;
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    const installation = await Installation.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { ticketId: id },
        { $expr: { $eq: [{ $toString: "$_id" }, id] } },
        { $expr: { $eq: [{ $toString: "$orderId" }, id] } }
      ]
    }).populate('customerId', 'fullName name email phoneNumber contactNo address').lean();

    if (!installation) {
      return res.status(404).json({ success: false, message: 'Installation not found' });
    }

    
    let siteDetails = installation.siteDetails;
    if (!siteDetails || Object.keys(siteDetails).length === 0) {
      if (installation.inspectionTicketId) {
        const InspectionReport = require('../inspection/inspectionReport.model');
        const report = await InspectionReport.findOne({ ticketId: installation.inspectionTicketId }).lean();
        if (report) {
          siteDetails = {
            buildingType: report.siteType || '-',
            floors: report.floorLevel ? parseInt(report.floorLevel) || 1 : 1,
            rooms: report.rooms ? report.rooms.length : 0,
            ceilingHeight: 'N/A',
            wallType: report.rooms && report.rooms[0] ? report.rooms[0].wallCondition || '-' : '-',
            powerSupply: report.rooms && report.rooms[0] && report.rooms[0].powerPointsNearby ? 'Available' : 'Not Available',
            outdoorAccess: report.parkingAvailability ? true : false
          };
        }
      }
    }

    const enrichedInstallation = {
      ...installation,
      siteDetails,
      location: installation.customerId?.address || installation.location || '-',
      customerId: installation.customerId ? { ...installation.customerId, name: installation.customerId.name || installation.customerId.fullName, contactNo: installation.customerId.contactNo || installation.customerId.phoneNumber } : null,
    };

    res.json({ success: true, data: enrichedInstallation });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Error fetching installation details',
      error: err.message,
    });
  }
};

// 3. UPDATE installation status
exports.updateInstallationStatus = async (req, res) => {
  try {
    const { status, date } = req.body;
    const id = req.params.id;
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    
    const installation = await Installation.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { ticketId: id },
        { $expr: { $eq: [{ $toString: "$_id" }, id] } },
        { $expr: { $eq: [{ $toString: "$orderId" }, id] } }
      ]
    });
    
    if (!installation) {
      return res.status(404).json({ success: false, message: 'Installation not found' });
    }

    installation.status = status;
    if (date) installation.date = date;
    
    // Saving the document instance forces the pre-save hook to execute
    await installation.save();

    res.json({
      success: true,
      message: `Status updated successfully to ${status}`,
      data: installation
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 4. Mark Installation as Completed
exports.completeInstallation = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    
    const installation = await Installation.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { ticketId: id },
        { $expr: { $eq: [{ $toString: "$_id" }, id] } },
        { $expr: { $eq: [{ $toString: "$orderId" }, id] } }
      ]
    });
    
    if (!installation) {
      return res.status(404).json({ success: false, message: 'Installation record not found.' });
    }

    if (installation.status === EXECUTION_STATUS.COMPLETED) {
      return res.status(400).json({ success: false, message: 'Installation is already marked as Completed.' });
    }

    // Setting status to COMPLETED triggers the pre-save hook which creates the MaintenanceSchedule
    installation.status = EXECUTION_STATUS.COMPLETED;
    await installation.save(); // Hook runs here — any hook error is now propagated as a thrown exception

    // Reload to confirm maintenanceScheduleId was linked by the hook
    const finalizedInstallation = await Installation.findOne({ $or: [{ _id: id }, { ticketId: id }, { orderId: id }] }).populate('maintenanceScheduleId');

    const scheduleCreated = !!finalizedInstallation.maintenanceScheduleId;

    res.json({
      success: true,
      message: scheduleCreated
        ? `Installation marked as Completed and MaintenanceSchedule initialized with status 'New'.`
        : `Installation marked as Completed but MaintenanceSchedule could not be created. Please use the repair endpoint.`,
      scheduleCreated,
      data: finalizedInstallation
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 5a. REPAIR: Retroactively create missing MaintenanceSchedule records for already-completed
// installations that somehow have no linked schedule. Safe — never deletes any data.
exports.repairMissingSchedules = async (req, res) => {
  try {
    const MaintenanceSchedule = require('../maintenance/maintenanceSchedule.model');
    const { buildServiceTemplate, buildScheduleEndDate } = require('../maintenance/scheduleTemplate');
    const { 
      MAINTENANCE_SCHEDULE_STATUS, 
      INSTALLATION_MAINTENANCE_STATUS 
    } = require('../../../constants/enums');

    // Find completed installations that have no linked MaintenanceSchedule
    const orphaned = await Installation.find({
      status: EXECUTION_STATUS.COMPLETED,
      maintenanceScheduleId: null
    }).lean();

    if (orphaned.length === 0) {
      return res.json({ success: true, message: 'No orphaned completed installations found. All good!', created: 0 });
    }

    const results = [];

    for (const inst of orphaned) {
      try {
        // Double-check: maybe a schedule exists in the collection but the reference was not stored
        const existing = await MaintenanceSchedule.findOne({ installationId: inst._id });
        if (existing) {
          // Repair the broken reference only — do not delete or replace the existing schedule
          await Installation.findByIdAndUpdate(inst._id, {
            maintenanceScheduleId: existing._id,
            maintenanceStatus: INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED
          });
          results.push({ installationId: inst._id, action: 'reference_repaired', scheduleId: existing._id });
          continue;
        }

        const customer = await Customer.findById(inst.customerId).lean();

        const tsSegment = Date.now().toString(36).toUpperCase();
        const idSuffix  = String(inst._id).slice(-6).toUpperCase();
        const ticketId  = `MS-${tsSegment}-${idSuffix}`;
        const installationDate = inst.serviceDate || inst.date || inst.createdAt || new Date();

        const schedule = await MaintenanceSchedule.create({
          ticketId,
          installationId:   inst._id,
          customerId:       inst.customerId,
          fullName:     customer?.fullName     || 'Unknown Customer',
          customerEmail:    customer?.email    || null,
          customerPhone:    customer?.phoneNumber || null,
          installationDate,
          scheduleEndDate:  buildScheduleEndDate(installationDate),
          location:         customer?.address  || inst.location || '-',
          productType:      inst.productType   || 'Standard AC System',
          services:         buildServiceTemplate(),   // 6 services: first 4 under warranty
          status:           MAINTENANCE_SCHEDULE_STATUS.NEW,
        });

        // Update the installation's reference fields — no other data is touched
        await Installation.findByIdAndUpdate(inst._id, {
          maintenanceScheduleId: schedule._id,
          maintenanceStatus: INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED
        });

        results.push({ installationId: inst._id, action: 'schedule_created', scheduleId: schedule._id, ticketId });
      } catch (itemErr) {
        results.push({ installationId: inst._id, action: 'failed', error: itemErr.message });
      }
    }

    const created = results.filter(r => r.action === 'schedule_created').length;
    const repaired = results.filter(r => r.action === 'reference_repaired').length;
    const failed  = results.filter(r => r.action === 'failed').length;

    res.json({
      success: true,
      message: `Repair complete: ${created} schedule(s) created, ${repaired} reference(s) repaired, ${failed} failed.`,
      created,
      repaired,
      failed,
      results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 5b. UPGRADE: Upgrade existing 4-service records to 6-service records
exports.upgradeSchedules = async (req, res) => {
  try {
    const MaintenanceSchedule = require('../maintenance/maintenanceSchedule.model');
    const { buildServiceTemplate, buildScheduleEndDate } = require('../maintenance/scheduleTemplate');
    
    const all = await MaintenanceSchedule.find({});
    let upgraded = 0;
    let reset = 0;

    for (const doc of all) {
      let needsSave = false;
      
      // 1) Upgrade 4-service records to 6 services
      if (!doc.services || doc.services.length < 6) {
        const existing = doc.services || [];
        const template = buildServiceTemplate();
        const merged = template.map((svc, i) => ({
          serviceName:   svc.serviceName,
          underWarranty: svc.underWarranty,
          date:          existing[i] && existing[i].date ? existing[i].date : null,
        }));
        doc.services = merged;
        needsSave = true;
        upgraded++;
      } else {
        // Ensure underWarranty is set even if length is 6
        let updatedWarranties = false;
        doc.services.forEach((svc, i) => {
          if (typeof svc.underWarranty === 'undefined') {
            svc.underWarranty = i < 4;
            updatedWarranties = true;
          }
        });
        if (updatedWarranties) {
          needsSave = true;
          upgraded++;
        }
      }

      // 2) Add scheduleEndDate if missing
      if (!doc.scheduleEndDate && doc.installationDate) {
        doc.scheduleEndDate = buildScheduleEndDate(doc.installationDate);
        needsSave = true;
      }

      // 3) Reset 'Sent to CSA' back to 'New'
      if (doc.status === 'Sent to CSA') {
        doc.status = 'New';
        doc.sentToCsaAt = null;
        needsSave = true;
        reset++;
      }

      if (needsSave) {
        await doc.save();
      }
    }

    res.json({ success: true, message: `Migration complete. Upgraded to 6 services: ${upgraded}. Reset Sent to CSA -> New: ${reset}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 5. Get completed installations for Maintenance Schedule tab
exports.getCompletedInstallationsForMaintenance = async (req, res) => {
  try {
    const installations = await Installation.find({
      status: EXECUTION_STATUS.COMPLETED,
      maintenanceStatus: {
        $in: [
          INSTALLATION_MAINTENANCE_STATUS.INSTALLATION_COMPLETED,
          INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED,
          INSTALLATION_MAINTENANCE_STATUS.SENT_TO_CSA,
          INSTALLATION_MAINTENANCE_STATUS.SENT_TO_CUSTOMER
        ]
      }
    })
      .populate('customerId', 'fullName name email address phoneNumber contactNo')
      .populate('maintenanceScheduleId')
      .lean();

    res.json({ success: true, count: installations.length, data: installations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


