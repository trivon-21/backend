const router = require('express').Router();
const controller = require('./finance-workflow.controller');
const { protect } = require('../../middleware/protect');
const { authorize } = require('../../middleware/role.middleware');

router.use(protect);
router.use(authorize(['FINANCE', 'SUPER_ADMIN']));

router.get('/purchase-requests', controller.listPurchaseRequests);
router.post('/purchase-requests/:id/decision', controller.decidePurchaseRequest);
router.get('/non-po-receipts', controller.listNonPoReceipts);
router.post('/non-po-receipts/:id/reconcile', controller.reconcileNonPoReceipt);

module.exports = router;
