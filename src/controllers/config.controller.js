const Config = require('../models/config.model');
const SystemConfig = require('../models/SystemConfig');

// GET /api/config/bank
exports.getBankDetails = async (req, res) => {
  try {
    const config = await Config.findOne({ key: 'bank_details' });
    res.json({ success: true, data: config ? config.value : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/config/system-info
exports.getSystemInfo = async (req, res) => {
  try {
    const config = await SystemConfig.findOne();
    const systemInfo = config ? config.systemInfo : {
      systemName: 'AirLux',
      supportEmail: 'support@airlux.lk',
      supportPhoneNumber: '+94 11 234 5678'
    };
    res.json({ success: true, data: systemInfo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
