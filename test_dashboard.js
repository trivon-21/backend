const mongoose = require('mongoose');
const service = require('./src/modules/inventory-manager/inventory_manager.service');
const User = require('./src/models/User');

async function test() {
  try {
    const mongoUri = 'mongodb+srv://airluxUser:TrivonAirLuxB23@cluster0.v1y4rpf.mongodb.net/Dassana?appName=Cluster0';
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');
    
    const user = await User.findOne({ role: 'MANAGER' }) || await User.findOne();
    if (!user) {
      console.log('No user found');
      return;
    }
    
    const data = await service.getDashboardData(user);
    console.log('Dashboard Data Summary:');
    console.log('Manager:', data.managerName);
    console.log('Stats:', JSON.stringify(data.stats, null, 2));
    console.log('Activity Count:', data.recentActivity.length);
    console.log('Reorder List Count:', data.reorderList.length);
    console.log('Logistics Count:', data.logistics.length);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

test();
