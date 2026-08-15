const mongoose = require('mongoose');

// Generic key-value config store for site-wide settings (e.g. bank details)
const ConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Config', ConfigSchema);
