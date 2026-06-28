const mongoose = require('mongoose');
const Installation = require('./installation.model');
const Customer = require('../../customer/customer.model');
const TechTeam = require('../../service-team/serviceTeam.model');

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
    const visibleStatuses = STATUS_GROUPS.EXECUTION_VISIBLE;
    
    const query = { status: { $in: visibleStatuses } };
    if (req.query.status && req.query.status !== 'All') query.status = req.query.status;

    const installations = await Installation.find(query)
      .populate('customerId', 'name address')
      .populate('assignedTeam', 'teamName')
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

    const customerIds = Array.from(new Set(
      installations
        .map((item) => toCustomerId(item.customerId))
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
      const populatedCustomer = item.customerId && typeof item.customerId === 'object' ? item.customerId : null;
      const customer = (customerId && customerById.get(customerId)) || populatedCustomer;
      const resolvedTeam = item.assignedTeamId ? teamById.get(String(item.assignedTeamId)) : null;
      const assignedTeamName = item.assignedTeam?.teamName
        || item.assignedTeamName
        || resolvedTeam?.teamName
        || (typeof item.assignedTeam === 'string' ? item.assignedTeam : null)
        || DEFAULTS.UNASSIGNED;

      return {
        ...item,
        customerName: customer?.name || item.customerName || DEFAULTS.UNKNOWN_CUSTOMER,
        location: customer?.address || '-',
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
    const installation = await Installation.findById(id)
      .populate('customerId', 'name email contactNo address')
      .lean();

    if (!installation) {
      return res.status(404).json({ success: false, message: 'Installation not found' });
    }

    const enrichedInstallation = {
      ...installation,
      location: installation.customerId?.address || installation.location || '-',
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

    const installation = await Installation.findById(req.params.id);
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

    const installation = await Installation.findById(id);
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
    const finalizedInstallation = await Installation.findById(id).populate('maintenanceScheduleId');

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
          customerName:     customer?.name     || 'Unknown Customer',
          customerEmail:    customer?.email    || null,
          customerPhone:    customer?.contactNo || null,
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
      .populate('customerId', 'name email address contactNo')
      .populate('maintenanceScheduleId')
      .lean();

    res.json({ success: true, count: installations.length, data: installations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};