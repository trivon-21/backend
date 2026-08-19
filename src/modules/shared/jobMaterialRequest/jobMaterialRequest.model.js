const mongoose = require('mongoose');
const { Schema } = mongoose;

const jobMaterialRequestSchema = new Schema(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    jobId: { type: Schema.Types.ObjectId, refPath: 'jobType' },
    jobType: { type: String, enum: ['Installation', 'Maintenance', 'Repair'] }, // NEW — needed for the polymorphic ref
    items: [{ itemName: String, quantity: Number, unitPrice: Number, total: Number }],
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  },
  { timestamps: true, collection: 'job_material_requests' } 
);

module.exports = mongoose.model('JobMaterialRequest', jobMaterialRequestSchema);
