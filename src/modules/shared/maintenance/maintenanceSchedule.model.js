const mongoose = require('mongoose');
const { Schema } = mongoose;

const maintenanceScheduleSchema = new Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    installationId: { type: Schema.Types.ObjectId, ref: 'Installation' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['New', 'Draft Saved', 'Sent to CSA', 'Sent to Customer'], default: 'New' },
    services: [{ serviceName: String, date: Date }],
  },
  { timestamps: true, collection: 'maintenance_schedules' }
);

module.exports = mongoose.model('MaintenanceSchedule', maintenanceScheduleSchema);
