const Config = require('../models/config.model');

// GET /api/config/bank
exports.getBankDetails = async (req, res) => {
  try {
    const config = await Config.findOne({ key: 'bank_details' });
    res.json({ success: true, data: config ? config.value : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
