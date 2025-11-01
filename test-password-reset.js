/**
 * Test Password Reset Flow
 * Tests: Database → Backend → Frontend Integration
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'https://alttext-ai-backend.onrender.com';

console.log('🧪 Testing Password Reset Flow\n');
console.log('=' .repeat(60));

let testResults = {
  database: [],
  backend: [],
  integration: [],
  errors: []
};

async function testDatabase() {
  console.log('\n📊 Testing Database...');
  
  try {
    // Test 1: Check if table exists
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'password_reset_tokens'
      );
    `;
    
    if (tableExists[0]?.exists) {
      testResults.database.push('✅ Table exists');
      console.log('  ✅ password_reset_tokens table exists');
    } else {
      testResults.database.push('❌ Table missing');
      testResults.errors.push('Table does not exist');
      console.log('  ❌ password_reset_tokens table NOT FOUND');
      return false;
    }
    
    // Test 2: Check table structure
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'password_reset_tokens'
      ORDER BY ordinal_position;
    `;
    
    const requiredColumns = ['id', 'userId', 'token', 'expiresAt', 'used', 'createdAt'];
    const foundColumns = columns.map(c => c.column_name);
    const missingColumns = requiredColumns.filter(c => !foundColumns.includes(c));
    
    if (missingColumns.length === 0) {
      testResults.database.push('✅ All required columns present');
      console.log('  ✅ All required columns present:', foundColumns.join(', '));
    } else {
      testResults.database.push(`❌ Missing columns: ${missingColumns.join(', ')}`);
      testResults.errors.push(`Missing columns: ${missingColumns.join(', ')}`);
      console.log('  ❌ Missing columns:', missingColumns);
    }
    
    // Test 3: Try creating a test token
    const testUser = await prisma.user.findFirst();
    if (testUser) {
      const testToken = await prisma.passwordResetToken.create({
        data: {
          userId: testUser.id,
          token: 'test-token-' + Date.now(),
          expiresAt: new Date(Date.now() + 3600000) // 1 hour
        }
      });
      
      testResults.database.push('✅ Can create tokens');
      console.log('  ✅ Successfully created test token (ID:', testToken.id + ')');
      
      // Clean up
      await prisma.passwordResetToken.delete({
        where: { id: testToken.id }
      });
      console.log('  ✅ Test token cleaned up');
    } else {
      testResults.database.push('⚠️  No users found to test with');
      console.log('  ⚠️  No users in database to test token creation');
    }
    
    return true;
  } catch (error) {
    testResults.database.push(`❌ Database error: ${error.message}`);
    testResults.errors.push(`Database error: ${error.message}`);
    console.error('  ❌ Database test failed:', error.message);
    return false;
  }
}

async function testBackend() {
  console.log('\n🌐 Testing Backend Endpoints...');
  console.log(`  API URL: ${API_URL}`);
  
  try {
    // Test 1: Test forgot-password endpoint (with invalid email to avoid rate limits)
    try {
      const forgotResponse = await axios.post(`${API_URL}/auth/forgot-password`, {
        email: 'test-nonexistent-' + Date.now() + '@example.com'
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      if (forgotResponse.data.success) {
        testResults.backend.push('✅ POST /auth/forgot-password works');
        console.log('  ✅ POST /auth/forgot-password endpoint responds correctly');
        console.log('     Response:', forgotResponse.data.message);
      } else {
        testResults.backend.push('⚠️  /auth/forgot-password returned unexpected format');
        console.log('  ⚠️  Unexpected response format');
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 404) {
          testResults.backend.push('❌ Endpoint not found (404)');
          testResults.errors.push('Backend endpoint /auth/forgot-password not deployed');
          console.log('  ❌ POST /auth/forgot-password returns 404 - endpoint not deployed');
        } else {
          testResults.backend.push(`⚠️  HTTP ${error.response.status}: ${error.response.data?.error || 'Unknown error'}`);
          console.log(`  ⚠️  HTTP ${error.response.status}:`, error.response.data?.error || 'Unknown error');
        }
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        testResults.backend.push('❌ Cannot reach backend');
        testResults.errors.push(`Backend unreachable: ${error.message}`);
        console.log('  ❌ Cannot connect to backend:', error.message);
      } else {
        testResults.backend.push(`❌ Error: ${error.message}`);
        console.log('  ❌ Error:', error.message);
      }
    }
    
    // Test 2: Test reset-password endpoint (will fail with invalid token, but endpoint should exist)
    try {
      const resetResponse = await axios.post(`${API_URL}/auth/reset-password`, {
        email: 'test@example.com',
        token: 'invalid-test-token',
        newPassword: 'testpassword123'
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });
      
      // We expect 400 (invalid token) or 404 (user not found), not 404 (endpoint not found)
      if (resetResponse.status === 404 && resetResponse.data.includes('Cannot POST')) {
        testResults.backend.push('❌ Endpoint not found (404)');
        testResults.errors.push('Backend endpoint /auth/reset-password not deployed');
        console.log('  ❌ POST /auth/reset-password returns 404 - endpoint not deployed');
      } else if (resetResponse.status === 400 || resetResponse.status === 404) {
        testResults.backend.push('✅ POST /auth/reset-password works');
        console.log('  ✅ POST /auth/reset-password endpoint exists');
        console.log('     Response (expected error):', resetResponse.data.error || resetResponse.data.message);
      } else {
        testResults.backend.push(`⚠️  Unexpected status: ${resetResponse.status}`);
        console.log(`  ⚠️  Unexpected status ${resetResponse.status}`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.log('  ⚠️  Cannot test reset endpoint (backend unreachable)');
      } else {
        testResults.backend.push(`⚠️  Reset endpoint error: ${error.message}`);
        console.log('  ⚠️  Error testing reset endpoint:', error.message);
      }
    }
    
    // Test 3: Test subscription endpoint
    try {
      const subscriptionResponse = await axios.get(`${API_URL}/billing/subscription`, {
        headers: { 
          'Authorization': 'Bearer invalid-token-for-testing'
        },
        timeout: 10000,
        validateStatus: () => true
      });
      
      if (subscriptionResponse.status === 401) {
        testResults.backend.push('✅ GET /billing/subscription exists (requires auth)');
        console.log('  ✅ GET /billing/subscription endpoint exists (requires authentication)');
      } else if (subscriptionResponse.status === 404 && subscriptionResponse.data.includes('Cannot GET')) {
        testResults.backend.push('❌ Subscription endpoint not found');
        testResults.errors.push('Backend endpoint /billing/subscription not deployed');
        console.log('  ❌ GET /billing/subscription returns 404 - endpoint not deployed');
      } else {
        testResults.backend.push(`✅ GET /billing/subscription responds (status: ${subscriptionResponse.status})`);
        console.log(`  ✅ GET /billing/subscription responds (status: ${subscriptionResponse.status})`);
      }
    } catch (error) {
      if (error.response && error.response.status === 404 && error.response.data.includes('Cannot GET')) {
        testResults.backend.push('❌ Subscription endpoint not found');
        console.log('  ❌ Subscription endpoint not deployed');
      } else {
        console.log('  ⚠️  Cannot fully test subscription endpoint');
      }
    }
    
  } catch (error) {
    testResults.backend.push(`❌ Backend test error: ${error.message}`);
    testResults.errors.push(`Backend error: ${error.message}`);
    console.error('  ❌ Backend test failed:', error.message);
  }
}

async function testIntegration() {
  console.log('\n🔗 Testing Integration Points...');
  
  try {
    // Check if we have a test user
    const testUser = await prisma.user.findFirst({
      where: {
        email: { contains: 'test' }
      }
    });
    
    if (!testUser) {
      testResults.integration.push('⚠️  No test user found');
      console.log('  ⚠️  No test users found - skipping integration test');
      console.log('  💡 Create a user first via registration endpoint');
      return;
    }
    
    console.log(`  Using test user: ${testUser.email}`);
    
    // Test: Create a password reset token
    const token = 'integration-test-' + Date.now();
    const resetToken = await prisma.passwordResetToken.create({
      data: {
        userId: testUser.id,
        token: token,
        expiresAt: new Date(Date.now() + 3600000)
      }
    });
    
    testResults.integration.push('✅ Can create reset tokens');
    console.log('  ✅ Created reset token for integration test');
    
    // Test: Verify token exists and is valid
    const foundToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: token,
        used: false,
        expiresAt: { gt: new Date() }
      }
    });
    
    if (foundToken) {
      testResults.integration.push('✅ Can query tokens correctly');
      console.log('  ✅ Token query works correctly');
      
      // Clean up
      await prisma.passwordResetToken.delete({
        where: { id: resetToken.id }
      });
      console.log('  ✅ Test token cleaned up');
    } else {
      testResults.integration.push('❌ Token query failed');
      console.log('  ❌ Token query failed');
    }
    
  } catch (error) {
    testResults.integration.push(`❌ Integration test error: ${error.message}`);
    testResults.errors.push(`Integration error: ${error.message}`);
    console.error('  ❌ Integration test failed:', error.message);
  }
}

async function runTests() {
  const dbOk = await testDatabase();
  await testBackend();
  if (dbOk) {
    await testIntegration();
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Test Summary\n');
  
  console.log('Database Tests:');
  testResults.database.forEach(result => console.log(`  ${result}`));
  
  console.log('\nBackend Tests:');
  testResults.backend.forEach(result => console.log(`  ${result}`));
  
  console.log('\nIntegration Tests:');
  testResults.integration.forEach(result => console.log(`  ${result}`));
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors Found:');
    testResults.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  const allOk = testResults.errors.length === 0;
  
  console.log('\n' + '='.repeat(60));
  if (allOk) {
    console.log('✅ All tests passed! Password reset flow is ready.');
  } else {
    console.log('⚠️  Some tests failed. Review errors above.');
    console.log('\n📝 Next Steps:');
    if (testResults.errors.some(e => e.includes('not deployed'))) {
      console.log('  1. Deploy backend changes to Render');
      console.log('  2. Wait for deployment to complete');
      console.log('  3. Re-run tests');
    }
    if (testResults.errors.some(e => e.includes('Table'))) {
      console.log('  1. Run: npx prisma db push');
      console.log('  2. Verify table creation');
      console.log('  3. Re-run tests');
    }
  }
  
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

