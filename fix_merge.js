const fs = require('fs');

const routesPath = 'src/modules/shared/jobMaterialRequest/jobMaterialRequest.routes.js';
const controllerPath = 'src/modules/shared/jobMaterialRequest/jobMaterialRequest.controller.js';

let routesContent = fs.readFileSync(routesPath, 'utf8');

const headMatch = routesContent.match(/<<<<<<< HEAD[\s\S]*?(router\.get\('\/', async \(req, res\) => \{[\s\S]*?\}\);\s*const \{ body, validationResult \} = require\('express-validator'\);\s*\/\/[^\n]*\s*const validateMaterialSubmission = \[[\s\S]*?\];\s*\/\/[^\n]*\s*router\.post\('\/submit-to-finance', validateMaterialSubmission, materialController\.sendToFinance\);)[\s\S]*?=======/);

let extractedLogic = '';
if (headMatch) {
    let rawHead = headMatch[1];
    rawHead = rawHead.replace(/router\.get\('\/', async \(req, res\) => \{/, 'exports.getNewRequests = async (req, res) => {');
    rawHead = rawHead.replace(/const validateMaterialSubmission = \[/, 'exports.validateMaterialSubmission = [');
    rawHead = rawHead.replace(/router\.post\('\/submit-to-finance'.*/, '');
    extractedLogic = '\n\n// --- Migrated from routes ---\n' + rawHead;
}

let controllerContent = fs.readFileSync(controllerPath, 'utf8');
if (extractedLogic && !controllerContent.includes('exports.getNewRequests')) {
    fs.writeFileSync(controllerPath, controllerContent + extractedLogic);
    console.log('Updated controller');
}

const cleanRoutes = "const router = require('express').Router();\n" +
"const controller = require('./jobMaterialRequest.controller');\n" +
"const { protect } = require('../../../middleware/protect');\n" +
"const { authorize } = require('../../../middleware/role.middleware');\n\n" +
"router.use(protect);\n\n" +
"router.get('/catalog', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.getMaterialCatalog);\n" +
"router.get('/dropdown-tickets', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.listEligibleJobs);\n" +
"router.get('/', authorize(['MAIN_TECH', 'FINANCE', 'SUPER_ADMIN']), controller.listCanonicalRequests);\n" +
"router.post('/submit-to-finance', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.submitCanonicalRequest);\n" +
"router.patch('/:id/send-to-im', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.sendCanonicalRequestToInventory);\n" +
"router.patch('/:id/approve-finance', authorize(['FINANCE', 'SUPER_ADMIN']), controller.approveCanonicalRequest);\n" +
"router.patch('/:id/reject-finance', authorize(['FINANCE', 'SUPER_ADMIN']), controller.rejectCanonicalRequest);\n" +
"router.patch('/:id/cancel', authorize(['MAIN_TECH', 'SUPER_ADMIN']), controller.cancelCanonicalRequest);\n\n" +
"// Added from HEAD\n" +
"router.get('/new-requests', controller.getNewRequests);\n" +
"router.post('/submit-to-finance-custom', controller.validateMaterialSubmission, controller.sendToFinance);\n\n" +
"module.exports = router;\n";

fs.writeFileSync(routesPath, cleanRoutes);
console.log('Updated routes');
