require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const productRoutes = require('./routes/product.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const bankDetailRoutes = require('./routes/bankDetail.routes');
const authRoutes = require('./routes/auth.routes');
const cartScenarioRoutes = require('./routes/cartScenario.routes');
const path = require('path');

const app = express();

// Connect to MongoDB Atlas
connectDB();

// Middleware
app.use(cors({
    origin: 'http://localhost:4200',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({ success: true, message: 'AirLux API is running' });
});

// Routes
app.use('/api/products', productRoutes);
app.use('/api/scenarios', cartScenarioRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', bankDetailRoutes);
app.use('/api/checkout', bankDetailRoutes);
app.use('/api/auth', authRoutes);

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
