const axios = require('axios');
const assert = require('assert');

const API_URL = 'http://localhost:3000/api';
let authToken;
let adminAuthToken;

async function runTests() {
  try {
    // Test Authentication
    console.log('Testing Authentication...');
    const authResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@rotc.edu',
      password: 'password'
    });
    adminAuthToken = authResponse.data.token;
    assert(adminAuthToken, 'Admin authentication failed');
    console.log('✅ Authentication successful');

    // Test Cadet Management
    console.log('\nTesting Cadet Management...');
    const cadetsResponse = await axios.get(`${API_URL}/cadets`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` }
    });
    assert(cadetsResponse.data.length > 0, 'No cadets found');
    console.log('✅ Cadet management working');

    // Test Training Management
    console.log('\nTesting Training Management...');
    const trainingResponse = await axios.get(`${API_URL}/training/events`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` }
    });
    assert(trainingResponse.data.length > 0, 'No training events found');
    console.log('✅ Training management working');

    // Test Inventory Management
    console.log('\nTesting Inventory Management...');
    const inventoryResponse = await axios.get(`${API_URL}/inventory/items`, {
      headers: { Authorization: `Bearer ${adminAuthToken}` }
    });
    assert(inventoryResponse.data.length > 0, 'No inventory items found');
    console.log('✅ Inventory management working');

    // Test Communications
    console.log('\nTesting Communications...');
    const announcement = {
      title: 'Test Announcement',
      content: 'This is a test announcement',
      priority: 'medium',
      targetAudience: ['all']
    };
    const communicationResponse = await axios.post(
      `${API_URL}/communication/announcements`,
      announcement,
      { headers: { Authorization: `Bearer ${adminAuthToken}` } }
    );
    assert(communicationResponse.data._id, 'Failed to create announcement');
    console.log('✅ Communications working');

    console.log('\n🎉 All tests passed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
  }
}

runTests();
