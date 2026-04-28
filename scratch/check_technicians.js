const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkTechnicians() {
    try {
        const uri = 'mongodb+srv://airluxUser:TrivonAirLuxB23@cluster0.v1y4rpf.mongodb.net/Dassana?appName=Cluster0';
        await mongoose.connect(uri);
        const technicians = await mongoose.connection.db.collection('TechTeamMembers').find({}).limit(5).toArray();
        console.log('Technicians Sample:', JSON.stringify(technicians, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}
checkTechnicians();
