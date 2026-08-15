const express = require('express');
const router = express.Router();
const cartScenarioController = require('../controllers/cartScenario.controller');

router.get('/', cartScenarioController.getScenarios);
router.post('/seed', cartScenarioController.seedScenarios);
router.post('/checkout', cartScenarioController.checkoutScenario);

module.exports = router;
