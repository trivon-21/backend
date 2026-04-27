const express = require('express');
const authController = require('./auth.controller');
const { ROUTES } = require('./auth.constants');

const router = express.Router();

router.post(ROUTES.LOGIN, authController.login);

module.exports = router;
