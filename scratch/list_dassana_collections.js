const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function listDassanaCollections() {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error('MONGO_URI not found');

        // Extract the base URI (everything before the database name)
        // mongodb+srv://user:pass@host/db?options
        const baseUri = uri.split('.net/')[0] + '.net/';
        const options = uri.split('?')[1] || '';
        const targetUri = `${baseUri}Dassana?${options}`;

        console.log('Target URI:', targetUri.replace(/:([^@]+)@/, ':****@')); // Hide password in logs
        
        await mongoose.connect(targetUri);
        const collections = await mongoose.connection.db.listCollections().toArray();
        
        console.log('\n--- Collections in Dassana ---');
        if (collections.length === 0) {
            console.log('No collections found.');
        } else {
            collections.forEach(col => console.log(`- ${col.name}`));
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

listDassanaCollections();
