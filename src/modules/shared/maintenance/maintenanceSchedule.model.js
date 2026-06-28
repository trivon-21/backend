const mongoose = require('mongoose');
const { MAINTENANCE_SCHEDULE_STATUS } = require('../../../constants/enums');

const serviceItemSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: null   // Filled in by the technician when scheduling
  },
  underWarranty: {
    type: Boolean,
    default: false  // First 4 services are under warranty; 5th & 6th are post-warranty
  }
}, { _id: false });

const maintenanceScheduleSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  installationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Installation',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: String,
  customerPhone: String,
  installationDate: {
    type: Date,
    required: true
  },
  // Automatically computed as installationDate + 3 years
  scheduleEndDate: {
    type: Date,
    default: null
  },
  location: {
    type: String,
    required: true
  },
  productType: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: [
      MAINTENANCE_SCHEDULE_STATUS.NEW,
      MAINTENANCE_SCHEDULE_STATUS.DRAFT_SAVED,
      MAINTENANCE_SCHEDULE_STATUS.SENT_TO_CSA,
      MAINTENANCE_SCHEDULE_STATUS.SENT_TO_CUSTOMER,
    ],
    required: true,
    default: MAINTENANCE_SCHEDULE_STATUS.NEW
  },
  // 6 services over 3 years:
  //   Services 1-4 → under warranty
  //   Services 5-6 → post-warranty
  services: [serviceItemSchema],
  sentToCsaAt: {
    type: Date,
    default: null
  },
  sentToCustomerAt: {
    type: Date,
    default: null
  },
  csaNotes: String,
  customerNotes: String
}, { timestamps: true });

module.exports = mongoose.model('MaintenanceSchedule', maintenanceScheduleSchema, 'MaintenanceSchedules');
