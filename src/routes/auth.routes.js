const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login/mock', authController.mockLogin);

module.exports = router;
