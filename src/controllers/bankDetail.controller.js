const BankDetail = require('../models/bankDetail.model');
const AuditLog = require('../models/auditLog.model');

// GET /api/checkout/bank-details
exports.getBankDetails = async (req, res) => {
  try {
    const details = await BankDetail.findOne();
    if (!details) {
      return res.status(200).json({ 
        success: true, 
        data: {
          accountNumber: '1000XXXXXXXX',
          bankName: 'Sampath Bank',
          accountName: 'AirLux PVT LTD',
          branch: 'Colombo 03',
          currency: 'LKR'
        } 
      });
    }
    res.json({ success: true, data: details });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/admin/payment-settings
exports.updatePaymentSettings = async (req, res) => {
  try {
    const { accountNumber, bankName, accountName, branch } = req.body;

    // Validation
    if (!accountNumber || !bankName || !accountName || !branch) {
      return res.status(400).json({ 
        success: false, 
        message: 'All bank fields (Account No, Bank, Name, Branch) are required.' 
      });
    }

    // Capture before state for audit log
    const beforeState = await BankDetail.findOne().lean();

    // Upsert logic: Handle both initial Add and future Edits
    const updatedDetails = await BankDetail.findOneAndUpdate(
      {}, // Single document for the company
      {
        accountNumber,
        bankName,
        accountName,
        branch,
        updatedBy: req.user.id // From JWT middleware
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Audit Logging
    await AuditLog.create({
      action: 'UPDATE_BANK_DETAILS',
      resource: 'BankDetail',
      before: beforeState,
      after: updatedDetails,
      updatedBy: req.user.id
    });

    res.json({ 
      success: true, 
      message: 'Bank details updated successfully.', 
      data: updatedDetails 
    });

  } catch (err) {
    console.error('Update Payment Settings Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
