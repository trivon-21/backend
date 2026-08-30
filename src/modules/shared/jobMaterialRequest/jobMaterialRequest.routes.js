const router = require('express').Router();
const controller = require('./jobMaterialRequest.controller');
const { protect } = require('../../../middleware/protect');
const { authorize } = require('../../../middleware/role.middleware');

router.use(protect);

router.get('/catalog', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.getMaterialCatalog);
router.get('/dropdown-tickets', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.listEligibleJobs);
router.get('/', authorize(['MAIN_TECH', 'FINANCE', 'SUPER_ADMIN']), controller.listCanonicalRequests);
router.post('/submit-to-finance', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.submitCanonicalRequest);
router.patch('/:id/send-to-im', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.sendCanonicalRequestToInventory);
router.patch('/:id/approve-finance', authorize(['FINANCE', 'SUPER_ADMIN']), controller.approveCanonicalRequest);
router.patch('/:id/reject-finance', authorize(['FINANCE', 'SUPER_ADMIN']), controller.rejectCanonicalRequest);
router.patch('/:id/cancel', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.cancelCanonicalRequest);

module.exports = router;
