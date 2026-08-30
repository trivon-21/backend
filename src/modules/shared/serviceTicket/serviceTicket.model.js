const mongoose = require('mongoose');
const { Schema } = mongoose;

const serviceTicketSchema = new Schema(
  {
    
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestType: { type: String, enum: ['Maintenance', 'Repair'], required: true },
    description: { type: String, required: true },

    
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    serviceType: { type: String, enum: ['REPAIR', 'MAINTENANCE'] }, // may duplicate requestType during transition; reconcile in migration
    serviceFee: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['NEW','PENDING_PAYMENT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] },
    paymentSlipUrl: String,
    rejectionReason: String,
    slipUploadedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,

    
    subject: String,
    category: { type: String, default: 'repair', enum: ['installation', 'repair', 'maintenance', 'inspection'] },
    priority: { type: String, default: 'medium', enum: ['high', 'medium', 'low'] },
    status: { type: String, default: 'New', enum: ['New', 'Reviewed', 'Assigned', 'open', 'in-progress', 'resolved', 'escalated', 'Rejected'] }, // union of both status vocabularies â normalize during migration
    assignedTechnicianId: { type: Schema.Types.ObjectId, ref: 'User' },
    slaDueAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true, collection: 'service_tickets', strict: false }
);

// Auto-clear resolvedAt if ticket leaves the resolved state (mirrors Dassana's original hook)
serviceTicketSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === 'resolved' && !this.resolvedAt) this.resolvedAt = new Date();
    if (this.status !== 'resolved') this.resolvedAt = undefined;
  }
  next();
});

serviceTicketSchema.post('findOneAndUpdate', async function(doc) {
  if (!doc) return;
  
  if (doc.paymentStatus === 'APPROVED' && doc.status !== 'Finance Approved') {
    const ServiceRequest = require('../repair/repair.model');
    const Maintenance = require('../maintenance/maintenance.model');
    const Installation = require('../installation/installation.model');
    
    const requestType = (doc.requestType || doc.serviceType || 'Repair').toLowerCase();
    const docObj = doc.toObject();
    
    // Set status to Finance Approved
    docObj.status = 'Finance Approved';
    
    if (requestType === 'maintenance') {
      const maintenanceEntry = new Maintenance({
        ...docObj,
        materialList: doc.materials || [],
        totalEstimatedCost: 0
      });
      await maintenanceEntry.save({ validateBeforeSave: false });
    } else if (requestType === 'installation') {
      const installationEntry = new Installation(docObj);
      await installationEntry.save({ validateBeforeSave: false });
    } else {
      const serviceEntry = new ServiceRequest(docObj);
      await serviceEntry.save({ validateBeforeSave: false });
    }
    
    // Delete from service_tickets now that it has been moved
    await this.model.findByIdAndDelete(doc._id);
  }
});

module.exports = mongoose.models.ServiceTicket || mongoose.model('ServiceTicket', serviceTicketSchema);
