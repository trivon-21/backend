const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bankDetail.controller');
const { authorize } = require('../middleware/auth.middleware');

// GET /api/checkout/bank-details — allows any authenticated user to view
router.get('/bank-details', bankController.getBankDetails);

// PUT /api/admin/payment-settings — protected for Super Admin or Finance Officer
router.put(
  '/payment-settings',
  authorize(['Super Admin', 'Finance Officer']),
  bankController.updatePaymentSettings
);

module.exports = router;
