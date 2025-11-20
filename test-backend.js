/**
 * Comprehensive Backend Test Suite
 * Tests all endpoints after Supabase migration
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
let authToken = null;
let testUserId = null;
let testUserEmail = null;

// Test results storage
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper function to make requests
async function request(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 500,
      data: error.response?.data || { error: error.message }
    };
  }
}

// Test result recorder
function recordTest(name, passed, expected, actual, notes = '') {
  const result = {
    name,
    passed,
    expected,
    actual,
    notes,
    timestamp: new Date().toISOString()
  };
  
  if (passed) {
    results.passed.push(result);
    console.log(`✅ PASS: ${name}`);
  } else {
    results.failed.push(result);
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Expected: ${JSON.stringify(expected)}`);
    console.log(`   Actual: ${JSON.stringify(actual)}`);
    if (notes) console.log(`   Notes: ${notes}`);
  }
}

// Test suite
async function runTests() {
  console.log('🧪 Starting Backend Test Suite\n');
  console.log(`Testing against: ${BASE_URL}\n`);
  
  // 1. Health Check
  console.log('1. Testing Health Endpoint');
  const health = await request('GET', '/health');
  recordTest(
    'GET /health',
    health.success && health.status === 200 && health.data.status === 'ok',
    { status: 200, statusField: 'ok' },
    { status: health.status, statusField: health.data?.status },
    'Health check should return status ok'
  );
  
  // 2. Environment Variables Check
  console.log('\n2. Checking Environment Variables');
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  
  recordTest(
    'SUPABASE_URL is set',
    hasSupabaseUrl,
    true,
    hasSupabaseUrl,
    'Required for Supabase connection'
  );
  
  recordTest(
    'SUPABASE_SERVICE_ROLE_KEY is set',
    hasSupabaseKey,
    true,
    hasSupabaseKey,
    'Required for Supabase operations'
  );
  
  if (hasDatabaseUrl) {
    results.warnings.push({
      name: 'DATABASE_URL still set',
      message: 'DATABASE_URL should be removed after migration',
      recommendation: 'Remove DATABASE_URL from environment variables'
    });
    console.log('⚠️  WARNING: DATABASE_URL is still set (should be removed)');
  }
  
  // 3. Authentication Tests
  console.log('\n3. Testing Authentication Endpoints');
  
  // Register
  testUserEmail = `test_${Date.now()}@example.com`;
  const register = await request('POST', '/auth/register', {
    email: testUserEmail,
    password: 'testpassword123',
    service: 'alttext-ai'
  });
  
  const registerPassed = register.success && 
    register.status === 201 && 
    register.data.success === true &&
    register.data.token &&
    register.data.user &&
    register.data.user.email === testUserEmail;
  
  recordTest(
    'POST /auth/register',
    registerPassed,
    { status: 201, success: true, hasToken: true, hasUser: true },
    {
      status: register.status,
      success: register.data?.success,
      hasToken: !!register.data?.token,
      hasUser: !!register.data?.user
    }
  );
  
  if (registerPassed) {
    authToken = register.data.token;
    testUserId = register.data.user.id;
  }
  
  // Login
  const login = await request('POST', '/auth/login', {
    email: testUserEmail,
    password: 'testpassword123'
  });
  
  const loginPassed = login.success &&
    login.status === 200 &&
    login.data.success === true &&
    login.data.token &&
    login.data.user;
  
  recordTest(
    'POST /auth/login',
    loginPassed,
    { status: 200, success: true, hasToken: true, hasUser: true },
    {
      status: login.status,
      success: login.data?.success,
      hasToken: !!login.data?.token,
      hasUser: !!login.data?.user
    }
  );
  
  if (loginPassed && !authToken) {
    authToken = login.data.token;
  }
  
  // Get current user
  if (authToken) {
    const me = await request('GET', '/auth/me', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    recordTest(
      'GET /auth/me',
      me.success && me.status === 200 && me.data.success === true && me.data.user,
      { status: 200, success: true, hasUser: true },
      {
        status: me.status,
        success: me.data?.success,
        hasUser: !!me.data?.user
      }
    );
  }
  
  // 4. Usage Endpoints
  console.log('\n4. Testing Usage Endpoints');
  
  if (authToken) {
    const usage = await request('GET', '/usage', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    const usagePassed = usage.success &&
      usage.status === 200 &&
      usage.data.success === true &&
      usage.data.usage &&
      typeof usage.data.usage.used === 'number' &&
      typeof usage.data.usage.limit === 'number' &&
      typeof usage.data.usage.remaining === 'number';
    
    recordTest(
      'GET /usage',
      usagePassed,
      { status: 200, success: true, hasUsage: true, hasNumericFields: true },
      {
        status: usage.status,
        success: usage.data?.success,
        hasUsage: !!usage.data?.usage,
        hasNumericFields: usage.data?.usage ? 
          (typeof usage.data.usage.used === 'number' && 
           typeof usage.data.usage.limit === 'number') : false
      }
    );
    
    const history = await request('GET', '/usage/history?page=1&limit=10', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    recordTest(
      'GET /usage/history',
      history.success && history.status === 200 && history.data.success === true,
      { status: 200, success: true },
      {
        status: history.status,
        success: history.data?.success
      }
    );
  }
  
  // 5. Billing Endpoints
  console.log('\n5. Testing Billing Endpoints');
  
  const plans = await request('GET', '/billing/plans?service=alttext-ai');
  recordTest(
    'GET /billing/plans',
    plans.success && plans.status === 200 && plans.data.success === true && Array.isArray(plans.data.plans),
    { status: 200, success: true, hasPlansArray: true },
    {
      status: plans.status,
      success: plans.data?.success,
      hasPlansArray: Array.isArray(plans.data?.plans)
    }
  );
  
  if (authToken) {
    const billingInfo = await request('GET', '/billing/info', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    recordTest(
      'GET /billing/info',
      billingInfo.success && billingInfo.status === 200 && billingInfo.data.success === true,
      { status: 200, success: true },
      {
        status: billingInfo.status,
        success: billingInfo.data?.success
      }
    );
  }
  
  // 6. Error Handling Tests
  console.log('\n6. Testing Error Handling');
  
  // Invalid login
  const invalidLogin = await request('POST', '/auth/login', {
    email: 'nonexistent@example.com',
    password: 'wrongpassword'
  });
  
  recordTest(
    'POST /auth/login (invalid credentials)',
    !invalidLogin.success && invalidLogin.status === 401 && invalidLogin.data.code === 'INVALID_CREDENTIALS',
    { status: 401, code: 'INVALID_CREDENTIALS' },
    {
      status: invalidLogin.status,
      code: invalidLogin.data?.code
    }
  );
  
  // Missing auth token
  const noAuth = await request('GET', '/usage');
  recordTest(
    'GET /usage (no auth)',
    !noAuth.success && (noAuth.status === 401 || noAuth.status === 403),
    { status: 401 },
    { status: noAuth.status }
  );
  
  // Invalid endpoint
  const notFound = await request('GET', '/nonexistent');
  recordTest(
    'GET /nonexistent (404)',
    !notFound.success && notFound.status === 404,
    { status: 404 },
    { status: notFound.status }
  );
  
  // 7. Response Structure Validation
  console.log('\n7. Validating Response Structures');
  
  if (authToken) {
    const usage = await request('GET', '/usage', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    if (usage.data?.usage) {
      const requiredFields = ['used', 'limit', 'remaining', 'plan'];
      const hasAllFields = requiredFields.every(field => field in usage.data.usage);
      
      recordTest(
        'Usage response structure',
        hasAllFields,
        { hasAllRequiredFields: true },
        { hasAllRequiredFields: hasAllFields, fields: Object.keys(usage.data.usage) }
      );
    }
  }
  
  // 8. Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  console.log(`📊 Total Tests: ${results.passed.length + results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.failed.forEach(test => {
      console.log(`   - ${test.name}`);
    });
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(warning => {
      console.log(`   - ${warning.name}: ${warning.message}`);
    });
  }
  
  // Generate detailed report
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    summary: {
      total: results.passed.length + results.failed.length,
      passed: results.passed.length,
      failed: results.failed.length,
      warnings: results.warnings.length
    },
    results: {
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings
    }
  };
  
  console.log('\n📄 Detailed report saved to test-results.json');
  require('fs').writeFileSync('test-results.json', JSON.stringify(report, null, 2));
  
  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});

