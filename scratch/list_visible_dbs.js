const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function listVisibleDatabases() {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI not found in .env file');
        }

        console.log('Attempting to list all databases visible to airluxUser...');
        
        // Connect to admin or any default db
        await mongoose.connect(uri);
        
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        
        console.log('--- Accessible Databases ---');
        dbs.databases.forEach(db => console.log(`- ${db.name}`));
        
        process.exit(0);
    } catch (err) {
        console.error('Error Details:', err.message);
        if (err.message.includes('not authorized')) {
            console.log('\nNOTE: The user airluxUser is not authorized to list all databases.');
            console.log('This usually means they are restricted to specific databases (like "airlux") only.');
        }
        process.exit(1);
    }
}

listVisibleDatabases();
