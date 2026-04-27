const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

async function checkConnection() {
    try {
        console.log('Attempting to connect to:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB connection successful!');
        process.exit(0);
    } catch (err) {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    }
}

checkConnection();
