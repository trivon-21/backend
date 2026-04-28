const axios = require('axios');

async function testAssetEndpoints() {
    const baseUrl = 'http://localhost:5000/api/inventory';
    
    try {
        console.log('--- Testing Technicians ---');
        const techs = await axios.get(`${baseUrl}/technicians`);
        console.log('Technicians Count:', techs.data.length);
        
        console.log('\n--- Testing Asset Loans ---');
        const loans = await axios.get(`${baseUrl}/asset-loans`);
        console.log('Active Loans Count:', loans.data.length);
        
        console.log('\n--- Testing Return Logs ---');
        const logs = await axios.get(`${baseUrl}/asset-return-logs`);
        console.log('Return Logs Count:', logs.data.length);
        
        console.log('\n✅ All endpoints responded successfully');
    } catch (err) {
        console.error('❌ Error testing endpoints:', err.response ? err.response.data : err.message);
    }
}

testAssetEndpoints();
