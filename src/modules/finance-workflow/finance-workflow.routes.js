const router = require('express').Router();
const controller = require('./finance-workflow.controller');
const { protect } = require('../../middleware/protect');

router.get('/purchase-requests', protect, controller.listPurchaseRequests);
router.post('/purchase-requests/:id/decision', protect, controller.decidePurchaseRequest);
router.get('/non-po-receipts', protect, controller.listNonPoReceipts);
router.post('/non-po-receipts/:id/reconcile', protect, controller.reconcileNonPoReceipt);

module.exports = router;
