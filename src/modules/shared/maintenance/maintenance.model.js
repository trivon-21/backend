const mongoose = require('mongoose');
const { MAINTENANCE_STATUS } = require('../../../constants/enums');

const materialSchema = new mongoose.Schema({
  item: String,
  quantity: String,
  estimatedCost: Number
}, { _id: false });

const maintenanceSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  installationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Installation'
  },
  maintenanceScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MaintenanceSchedule'
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: String,
  customerPhone: String,
  productType: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  scheduledServiceType: {
    type: String,
    default: null
  },
  maintenanceType: {
    type: String,
    enum: ['Customer Initiated', 'Company Initiated'],
    default: 'Company Initiated'
  },
  isCustomerInitiated: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: [
      MAINTENANCE_STATUS.NEW,
      MAINTENANCE_STATUS.PENDING,
      MAINTENANCE_STATUS.FINANCE_APPROVED,
      MAINTENANCE_STATUS.SENT_TO_IM,
      MAINTENANCE_STATUS.ASSIGNED,
      MAINTENANCE_STATUS.SCHEDULED,
      MAINTENANCE_STATUS.IN_PROGRESS,
      MAINTENANCE_STATUS.ON_HOLD,
      MAINTENANCE_STATUS.COMPLETED,
    ],
    required: true,
    default: MAINTENANCE_STATUS.NEW
  },
  materialList: [materialSchema],
  totalEstimatedCost: Number,
  assignedTeam: {
    type: mongoose.Schema.Types.Mixed,
    ref: 'TechTeam',
    default: null
  },
  assignedTeamId: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  sentToInventoryManagerAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Maintenance', maintenanceSchema, 'Maintenances');
