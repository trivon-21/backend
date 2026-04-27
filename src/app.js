const dns = require('dns');
const express = require('express');
const cors = require('cors');
const { ROUTES } = require('./constants/enums');

const apiRoutes = require('./routes');

dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();

app.use(cors());
app.use(express.json());
app.use(ROUTES.API_BASE, apiRoutes);

module.exports = app;
