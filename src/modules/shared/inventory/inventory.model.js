const mongoose = require('mongoose');
const { WORKFLOW_STATUS } = require('../../../constants/enums');


const materialRequestSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true },
  requestType: { type: String, default: 'Service' },
  customerId: mongoose.Schema.Types.ObjectId,
  customerName: String,
  customerEmail: String,
  customerContactNo: String,
  customerAddress: String,
  location: String,
  serviceDate: Date,
  serviceDescription: String,
  status: {
    type: String,
    enum: [
      WORKFLOW_STATUS.NEW,
      WORKFLOW_STATUS.PENDING,
      WORKFLOW_STATUS.FINANCE_APPROVED,
      WORKFLOW_STATUS.FINANCE_REJECTED,
      WORKFLOW_STATUS.CANCELLED,
      WORKFLOW_STATUS.SENT_TO_IM,
    ],
    default: WORKFLOW_STATUS.NEW
  },
  materials: [{
    item: { type: String, required: true },
    quantity: { type: String, required: true }
  }],
  financeNotes: String,
  isUnderWarranty: { type: Boolean, default: false },
  isFreeOfCharge: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!selectedTicketId) {
    alert("Please select a ticket from the dropdown");
    return;
  }

  if (materials.length === 0) {
    alert("Please add at least one material item");
    return;
  }

  try {
    // Only call the API if the above checks pass
    await api.post('/submit-to-finance', { newRequestId: selectedTicketId, materials });
  } catch (err) {
    console.error(err);
  }
};

module.exports = mongoose.model('MaterialRequest', materialRequestSchema, 'MaterialRequests');
