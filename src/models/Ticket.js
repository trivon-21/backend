const mongoose = require('mongoose');

/**
 * Service Ticket
 *
 * Represents a field-service support ticket handled by the Manager area
 * (installations, repairs, maintenance, inspections). Introduced to back the
 * Manager → Tickets screen, which previously ran on mock data only.
 */
const TicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    subject: { type: String, required: true },
    description: { type: String, default: '' },
    customer: { type: String, required: true },
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
    assignedTo: { type: String, default: '' },
    slaDueAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'tickets',
  },
);

module.exports = mongoose.model('Ticket', TicketSchema);
