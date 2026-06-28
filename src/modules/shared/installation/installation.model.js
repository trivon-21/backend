const mongoose = require('mongoose');
const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
  INSTALLATION_MAINTENANCE_STATUS,
  MAINTENANCE_SCHEDULE_STATUS,
  DEFAULTS,
} = require('../../../constants/enums');

// Adjacent maintenance module
const MaintenanceSchedule = require('../maintenance/maintenanceSchedule.model');
const { buildServiceTemplate, buildScheduleEndDate } = require('../maintenance/scheduleTemplate');

const installationSchema = new mongoose.Schema({
  ticketId: {
    type: Number,
    default: null
  },
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Customer', 
    required: true 
  },
  inspectionReportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InspectionReport',
    default: null
  },
  productType: String,
  units: { type: Number, default: 1 },
  location: String,
  serviceDate: Date, 
  date: Date,        
  siteDetails: {
    buildingType: String,
    floors: Number,
    rooms: Number,
    ceilingHeight: String,
    wallType: String,
    powerSupply: String,
    outdoorAccess: String
  },
  
  status: {
    type: String,
    enum: [
      WORKFLOW_STATUS.NEW,
      WORKFLOW_STATUS.PENDING,
      WORKFLOW_STATUS.FINANCE_APPROVED,
      WORKFLOW_STATUS.FINANCE_REJECTED,
      WORKFLOW_STATUS.CANCELLED,
      WORKFLOW_STATUS.SENT_TO_IM,
      EXECUTION_STATUS.ASSIGNED,
      EXECUTION_STATUS.SCHEDULED,
      EXECUTION_STATUS.IN_PROGRESS,
      EXECUTION_STATUS.ON_HOLD,
      EXECUTION_STATUS.COMPLETED,
    ],
    default: WORKFLOW_STATUS.PENDING
  },

  maintenanceStatus: {
    type: String,
    enum: [
      INSTALLATION_MAINTENANCE_STATUS.INSTALLATION_COMPLETED,
      INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED,
      INSTALLATION_MAINTENANCE_STATUS.SENT_TO_CSA,
      INSTALLATION_MAINTENANCE_STATUS.SENT_TO_CUSTOMER,
    ],
    default: null
  },

  maintenanceScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MaintenanceSchedule',
    default: null
  },

  materials: [{
    item: String,
    quantity: String
  }],
  labour: {
    technicians: Number,
    helpers: Number,
    duration: String
  },
  financeNotes: String,
  reviewNotes: String,
  inspectionSnapshot: {
    inspectionMeta: {
      team: String,
      date: Date,
      time: String,
      notes: String,
      recommendedProducts: [String]
    },
    findings: [{
      category: String,
      description: String,
      status: String
    }],
    requirements: {
      materials: [{
        item: String,
        quantity: String
      }],
      labour: {
        technicians: Number,
        helpers: Number,
        duration: String
      }
    },
    photos: [{
      url: String,
      caption: String
    }]
  },
  
  assignedTeam: {
    type: mongoose.Schema.Types.Mixed,
    ref: 'TechTeam'
  },
  assignedTeamId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  assignedTeamName: {
    type: String,
    default: DEFAULTS.UNASSIGNED
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== DATABASE AUTOMATION HOOK ====================
// Fires whenever an Installation document is saved with status changed to 'Completed'.
// Creates exactly ONE new MaintenanceSchedule record (status: 'New') per installation.
// Never deletes any existing data in any collection.
installationSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === EXECUTION_STATUS.COMPLETED) {
    try {
      // Guard: do not create a duplicate schedule if one already exists for this installation
      const existingSchedule = await MaintenanceSchedule.findOne({ installationId: this._id });

      if (existingSchedule) {
        // A schedule already exists — just make sure our reference fields are in sync
        if (!this.maintenanceScheduleId) {
          this.maintenanceScheduleId = existingSchedule._id;
        }
        if (!this.maintenanceStatus) {
          this.maintenanceStatus = INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED;
        }
        console.log(`ℹ️  MaintenanceSchedule already exists for installation ${this._id} — skipping creation.`);
        return next();
      }

      // Build a guaranteed-unique ticketId using a timestamp segment + last 6 chars of the installation _id
      const tsSegment = Date.now().toString(36).toUpperCase();
      const idSuffix  = String(this._id).slice(-6).toUpperCase();
      const generatedTicketId = `MS-${tsSegment}-${idSuffix}`;

      // Attempt to load full customer details; fall back to whatever is already on the installation
      const Customer = mongoose.model('Customer');
      const customer = await Customer.findById(this.customerId).lean();

      const customerName  = customer?.name  || 'Unknown Customer';
      const customerEmail = customer?.email || null;
      const customerPhone = customer?.contactNo || null;
      const location      = customer?.address || this.location || '-';

      if (!customer) {
        console.warn(`⚠️  Customer not found for installation ${this._id}. Proceeding with available data.`);
      }

      const installationDate = this.serviceDate || this.date || new Date();

      const schedule = new MaintenanceSchedule({
        ticketId:        generatedTicketId,
        installationId:  this._id,
        customerId:      this.customerId,
        customerName,
        customerEmail,
        customerPhone,
        installationDate,
        scheduleEndDate:  buildScheduleEndDate(installationDate),  // 3 years from installation
        location,
        productType: this.productType || 'Standard AC System',
        services:    buildServiceTemplate(),   // 6 services: first 4 under warranty
        status:      MAINTENANCE_SCHEDULE_STATUS.NEW,
      });

      await schedule.save();

      // Link the new schedule back to this installation (no data deleted — only new fields set)
      this.maintenanceScheduleId = schedule._id;
      this.maintenanceStatus     = INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED;

      console.log(`✅ MaintenanceSchedule created: ${generatedTicketId} (status: New) for installation ${this._id} — customer: ${customerName}`);

    } catch (err) {
      // Propagate the error so the caller knows creation failed instead of silently swallowing it
      console.error('❌ Pre-save hook failed while creating MaintenanceSchedule:', err.message);
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('Installation', installationSchema, 'Installations');