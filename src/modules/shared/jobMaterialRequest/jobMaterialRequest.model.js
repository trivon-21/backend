const mongoose = require('mongoose');
const { Schema } = mongoose;

const jobMaterialRequestSchema = new Schema({
    jobId: { type: Schema.Types.ObjectId, required: true },
    jobType: { type: String, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    items: [{
        itemName: { type: String },
        quantity: { type: Number },
        unitPrice: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    }],
    status: { type: String, default: 'PENDING' }
}, { timestamps: true, collection: 'job_material_requests' });

module.exports = mongoose.models.JobMaterialRequest || mongoose.model('JobMaterialRequest', jobMaterialRequestSchema);
