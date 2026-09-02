const mongoose = require('mongoose');
const { Schema } = mongoose;

const installationSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'InstallationOrder' },
    inspectionTicketId: { type: Schema.Types.ObjectId, ref: 'InspectionTicket' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTeamId: { type: Schema.Types.ObjectId, ref: 'TechTeam' }, 
    assignedTeamName: String, // denormalized display copy, optional
    productType: String,
    units: { type: Number, default: 1 },
    location: String,
    serviceDate: Date,
    siteDetails: {
      buildingType: String,
      floors: Number,
      rooms: Number,
      ceilingHeight: String,
      wallType: String,
      powerSupply: String,
      outdoorAccess: Boolean,
    },
    materials: [{ item: String, quantity: Number }],
    financeNotes: String,
    status: {
      type: String,
      enum: ['Pending', 'Finance Approved', 'Finance Rejected', 'Sent to IM', 'Materials Ready', 'Assigned',
        'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'Pending'
    },
    maintenanceScheduleId: { type: Schema.Types.ObjectId, ref: 'MaintenanceSchedule' },
    maintenanceStatus: { type: String, default: null },
  },
  { timestamps: true, collection: 'installations', strict: false }
);

/**
 * Pre-save hook: when an installation transitions to 'Completed',
 * automatically create a MaintenanceSchedule record with status 'New'.
 */
installationSchema.pre('save', async function (next) {
  // Only act when the status field changed to 'Completed'
  if (!this.isModified('status') || this.status !== 'Completed') {
    return next();
  }

  // Guard: skip if a schedule is already linked
  if (this.maintenanceScheduleId) {
    return next();
  }

  try {
    const MaintenanceSchedule = mongoose.model('MaintenanceSchedule');
    const { buildServiceTemplate, buildScheduleEndDate } = require('../maintenance/scheduleTemplate');
    const {
      MAINTENANCE_SCHEDULE_STATUS,
      INSTALLATION_MAINTENANCE_STATUS,
    } = require('../../../constants/enums');

    // Fetch customer details for denormalized fields
    const User = mongoose.model('User');
    const customer = await User.findById(this.customerId).lean();

    // Generate a unique ticket ID  (e.g. MS-LZ1ABC-F9E8D7)
    const tsSegment = Date.now().toString(36).toUpperCase();
    const idSuffix  = String(this._id).slice(-6).toUpperCase();
    const ticketId  = `MS-${tsSegment}-${idSuffix}`;

    const installationDate = this.serviceDate || this.createdAt || new Date();

    const schedule = await MaintenanceSchedule.create({
      ticketId,
      installationId:   this._id,
      customerId:       this.customerId,
      fullName:         customer?.fullName     || 'Unknown Customer',
      customerEmail:    customer?.email         || null,
      customerPhone:    customer?.phoneNumber   || null,
      installationDate,
      scheduleEndDate:  buildScheduleEndDate(installationDate),
      location:         customer?.address       || this.location || '-',
      productType:      this.productType        || 'Standard AC System',
      services:         buildServiceTemplate(),
      status:           MAINTENANCE_SCHEDULE_STATUS.NEW,
    });

    // Link the newly created schedule back to this installation
    this.maintenanceScheduleId = schedule._id;
    this.maintenanceStatus = INSTALLATION_MAINTENANCE_STATUS.SCHEDULE_CREATED;

    next();
  } catch (err) {
    console.error('[Installation pre-save hook] Failed to create MaintenanceSchedule:', err.message);
    next(err);
  }
});

module.exports = mongoose.models.Installation || mongoose.model('Installation', installationSchema);
