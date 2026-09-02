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

// Added from HEAD
router.get('/new-requests', controller.getNewRequests);
router.post('/submit-to-finance-custom', controller.validateMaterialSubmission, controller.sendToFinance);
router.patch('/:id/send-to-im-custom', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.sendToInventoryManager);



router.post('/test-error', async (req, res) => {
  try {
    const data = await require('./jobMaterialRequest.service').submit(req.body, { _id: new require('mongoose').Types.ObjectId(), fullName: 'Test User' });
    res.json(data);
  } catch (e) {
    console.error('Test Error:', e);
    res.status(500).json({ e: e.message, stack: e.stack });
  }
});

module.exports = router;

router.get('/debug-job', async (req, res) => { const doc = await require('../repair/repair.model').findById('6a943177ef97c499c02582f7').lean(); res.json(doc); });


router.get('/debug-nuwan', async (req, res) => { const docs = await require('mongoose').connection.db.collection('tech_team_members').find({ name: /Nuwan/i }).toArray(); res.json(docs); });

