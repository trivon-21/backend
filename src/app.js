const express = require('express');
const cors = require('cors');
const path = require('path');
const { ROUTES } = require('./constants/enums');
const apiRoutes = require('./routes');


const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200').split(',').map(value => value.trim());
app.use(cors({ origin: allowedOrigins }));
app.get('/healthz', (req, res) => {
  const ready = require('mongoose').connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(ROUTES.API_BASE, apiRoutes);

module.exports = app;
