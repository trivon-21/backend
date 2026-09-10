const mongoose = require('mongoose');
const { Schema } = mongoose;

const maintenanceScheduleSchema = new Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    // One schedule belongs to one completed installation; the unique index also
    // prevents a concurrent completion from creating a second schedule.
    installationId: { type: Schema.Types.ObjectId, ref: 'Installation', unique: true, sparse: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['New', 'Draft Saved', 'Sent to CSA', 'Sent to Customer'], default: 'New' },
    services: [{ serviceName: String, date: Date }],
    sentToCsaAt: { type: Date },
    sentToCustomerAt: { type: Date },
    csaNotes: { type: String },
    customerNotes: { type: String },
  },
  { timestamps: true, collection: 'maintenance_schedules' }
);

module.exports = mongoose.model('MaintenanceSchedule', maintenanceScheduleSchema);
