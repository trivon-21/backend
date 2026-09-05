const mongoose = require('mongoose');
const { Schema } = mongoose;
const Counter = require('../../../models/counter.model');

const installationSchema = new Schema(
  {
    ticketId: { type: String, unique: true },
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
      enum: ['New', 'Pending', 'Finance Approved', 'Finance Rejected', 'Sent to IM', 'Materials Ready', 'Assigned',
        'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
      default: 'Pending'
    },
    maintenanceScheduleId: { type: Schema.Types.ObjectId, ref: 'MaintenanceSchedule' },
    maintenanceStatus: { type: String, default: null },
  },
  { timestamps: true, collection: 'installations', strict: false }
);

installationSchema.pre('validate', async function() {
  if (this.isModified('status') && this.status) {
    const lstatus = this.status.toLowerCase();
    if (lstatus === 'complete' || lstatus === 'completed') {
      this.status = 'Completed';
    }
  }
});

installationSchema.pre('save', async function () {
  // Generate ticketId for Installation if it doesn't exist
  if (this.isNew && !this.ticketId) {
    try {
      const CounterModel = mongoose.model('Counter');
      let counter = await CounterModel.findOneAndUpdate(
        { _id: 'installationTicket' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      if (!counter) {
        await CounterModel.updateOne({ _id: 'installationTicket' }, { $set: { seq: 1000 } }, { upsert: true });
        counter = { seq: 1000 };
      } else if (counter.seq < 1000) {
        counter = await CounterModel.findOneAndUpdate({ _id: 'installationTicket' }, { $set: { seq: 1000 } }, { new: true });
      }
      this.ticketId = `INT-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      throw err;
    }
  }

  // Only act when the status field changed to 'Completed'
  if (!this.isModified('status') || this.status !== 'Completed') {
    return;
  }

  // Guard: skip if a schedule is already linked
  if (this.maintenanceScheduleId) {
    return;
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

    // Generate unique MS- ID
    const CounterModel = mongoose.model('Counter');
    let msCounter = await CounterModel.findOneAndUpdate(
      { _id: 'maintenanceScheduleTicket' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    if (!msCounter) {
      await CounterModel.updateOne({ _id: 'maintenanceScheduleTicket' }, { $set: { seq: 1000 } }, { upsert: true });
      msCounter = { seq: 1000 };
    } else if (msCounter.seq < 1000) {
      msCounter = await CounterModel.findOneAndUpdate({ _id: 'maintenanceScheduleTicket' }, { $set: { seq: 1000 } }, { new: true });
    }
    const ticketId = `MS-${String(msCounter.seq).padStart(4, '0')}`;

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

    return;
  } catch (err) {
    console.error('[Installation pre-save hook] Failed to create MaintenanceSchedule:', err.message);
    throw err;
  }
});

module.exports = mongoose.models.Installation || mongoose.model('Installation', installationSchema);
