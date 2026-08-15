const mongoose = require('mongoose');

/**
 * Service Ticket
 *
 * Represents a field-service support ticket handled by the Manager area
 * (installations, repairs, maintenance, inspections). Introduced to back the
 * Manager → Tickets screen and its operational reporting.
 */
const TicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true, trim: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    customer: { type: String, required: true, trim: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    category: {
      type: String,
      enum: ['installation', 'repair', 'maintenance', 'inspection'],
      default: 'repair',
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'escalated'],
      default: 'open',
    },
    assignedTo: { type: String, default: '', trim: true },
    assignedTechnicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    slaDueAt: { type: Date },
    resolvedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'tickets',
  },
);

TicketSchema.pre('validate', function synchronizeResolutionTimestamp() {
  if (this.status === 'resolved' && !this.resolvedAt) {
    this.resolvedAt = new Date();
  } else if (this.status !== 'resolved' && this.resolvedAt) {
    this.resolvedAt = undefined;
  }
});

module.exports = mongoose.model('Ticket', TicketSchema);
