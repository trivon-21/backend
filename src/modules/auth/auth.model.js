const mongoose = require('mongoose');

// Flexible schema because existing Info documents may contain extra fields.
const infoSchema = new mongoose.Schema({}, {
  collection: 'users',
  strict: false,
  timestamps: false,
});

module.exports = mongoose.models.Info || mongoose.model('users', infoSchema);
