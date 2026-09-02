const mongoose = require("mongoose");
const Counter = require("./counter.model");

const serviceRequestSchema = new mongoose.Schema(
  {
    serviceRequestRef: {
      type: String,
      unique: true
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // AC Unit details
    acUnitModel: { type: String, trim: true, default: "" },
    acUnitSerial: { type: String, trim: true, default: "" },
    acWarrantyStatus: {
      type: String,
      enum: ["Active", "Expired", "Unknown"],
      default: "Unknown"
    },
    acAmcStatus: {
      type: String,
      enum: ["Active", "Not Active"],
      default: "Not Active"
    },

    serviceType: {
      type: String,
      enum: ["Repair", "Maintenance"],
      required: true
    },
    serviceTypeOther: { type: String, default: "" },
    problemDescription: { type: String, trim: true, default: "" },
    problemImageUrl: { type: String, default: "" },

    preferredDate: { type: Date },
    preferredTimeSlot: { type: String, default: "" },

    estimatedCharges: { type: Number, default: 0 },
    paymentRequired: { type: Boolean, default: false },

    // subject kept for backward compat
    subject: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["New", "Pending", "Assigned", "In Progress", "Completed", "Cancelled"],
      default: "New"
    }
  },
  { timestamps: true, collection: "service_tickets" }
);

serviceRequestSchema.pre('save', async function () {
  const doc = this;
  if (doc.isNew) {
    const CounterModel = mongoose.model('Counter');
    
    // First, try to just increment
    let counter = await CounterModel.findOneAndUpdate(
      { _id: 'serviceTicket' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    
    // If it's somehow null (which shouldn't happen with new+upsert, but just in case)
    if (!counter) {
      counter = { seq: 1000 };
      await CounterModel.updateOne(
        { _id: 'serviceTicket' },
        { $set: { seq: 1000 } },
        { upsert: true }
      );
    } 
    // If it's less than 1000, jump it to 1000
    else if (counter.seq < 1000) {
      counter = await CounterModel.findOneAndUpdate(
        { _id: 'serviceTicket' },
        { $set: { seq: 1000 } },
        { new: true }
      );
    }
    
    doc.serviceRequestRef = `SRQ-${counter.seq}`;
  }
});

module.exports = mongoose.models.ServiceRequest || mongoose.model('ServiceRequest', serviceRequestSchema);