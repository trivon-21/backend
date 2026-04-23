const mongoose = require("mongoose");

const inspectionTicketSchema = new mongoose.Schema(
  {
    orderId:         { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    customerId:      { type: mongoose.Schema.Types.ObjectId, ref: "User",  required: true },
    status: {
      type: String,
      enum: [
        "PENDING_PAYMENT",
        "PAYMENT_UNDER_REVIEW",
        "PAYMENT_CONFIRMED",
        "PAYMENT_REJECTED",
        "INSPECTION_SCHEDULED",
        "ONGOING",
        "REPORT_RECORDED",
        "INSPECTED",
      ],
      default: "PENDING_PAYMENT",
    },
    inspectionFee:   { type: Number, default: 5000 },
    slipUrl:         { type: String, default: null  },
    rejectionReason: { type: String, default: null  },
    scheduledDate:   { type: Date,   default: null  },
    slipUploadedAt:  { type: Date,   default: null  },
    approvedAt:      { type: Date,   default: null  },
    rejectedAt:      { type: Date,   default: null  },
    scheduledAt:     { type: Date,   default: null  },
    startedAt:       { type: Date,    default: null  },
    inspectedAt:     { type: Date,    default: null  },
    reminderSent:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InspectionTicket", inspectionTicketSchema);