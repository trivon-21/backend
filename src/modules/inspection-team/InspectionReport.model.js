const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  // Section 3
  name: String,
  length: Number, width: Number, height: Number, area: Number,
  sunExposure: Number, ventilation: Number, windows: Number,
  // Section 4
  possibleWallLocations: String, wallCondition: String, spaceAvailability: String,
  outdoorAvailableLocations: String, surfaceCondition: String,
  ventilationCondition: String, exposureToWeather: String,
  // Section 5
  indoorOutdoorDistance: String, distanceMeasured: String,
  possibleRoutingPath: String, routingPathDescription: String,
  estimatedBends: String, drainOutletAvailable: Boolean,
  drainType: String, drainPathDescription: String,
  obstacles: [String], obstacleDetails: String,
  wallDrillingRequired: Boolean, drillPoints: String, verticalHeightDiff: String,
  // Section 6
  powerPointsNearby: Boolean, wiringConditionVisible: Boolean,
  earthingAvailability: Boolean, distanceToBoard: String, electricalLimitations: String,
  // Section 7
  constraintsRisks: String,
  // Section 8
  inspectorNotes: String,
});

const inspectionReportSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "InspectionTicket", required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Section 1
    customerName: String, contactNumber: String,
    siteAddress: String, siteType: String, inspectionDate: String,

    // Section 2
    siteStatus: String, floorLevel: String,
    elevatorAvailability: Boolean, parkingAvailability: String,

    // Rooms (sections 3-8 per room)
    rooms: [roomSchema],

    // Section 9 - Photos
    photos: [{ name: String, dataUrl: String }],

    // Section 10 - Acknowledgement
    inspectorName: String, acknowledgeDate: String, acknowledgeTime: String,

    // Status
    status: {
      type: String,
      enum: ["DRAFT", "RECORDED", "SUBMITTED"],
      default: "DRAFT"
    },
    submittedAt: Date,
    recordedAt: Date,
    reportId: { type: String, unique: true, sparse: true }
  },
  { timestamps: true }
);

inspectionReportSchema.pre('save', async function (next) {
  if (this.isNew && !this.reportId) {
    try {
      require('../../models/counter.model');
      const CounterModel = mongoose.model('Counter');
        { _id: 'inspectionReportId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      if (!counter) {
        await CounterModel.updateOne({ _id: 'inspectionReportId' }, { $set: { seq: 1000 } }, { upsert: true });
        counter = { seq: 1000 };
      } else if (counter.seq < 1000) {
        counter = await CounterModel.findOneAndUpdate({ _id: 'inspectionReportId' }, { $set: { seq: 1000 } }, { new: true });
      }
      this.reportId = `IREP-${String(counter.seq).padStart(4, '0')}`;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.models.InspectionReport || mongoose.model("InspectionReport", inspectionReportSchema);