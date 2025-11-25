/**
 * Mock express-rate-limit globally for all tests
 * This mock implements basic rate limiting for testing
 * Must be at top level for Jest hoisting
 */
jest.mock('express-rate-limit', () => {
  return jest.fn((options) => {
    // Track requests per route/IP combination
    const requestCounts = new Map();

    return (req, res, next) => {
      const key = `${req.path}:${req.ip}`;
      const count = (requestCounts.get(key) || 0) + 1;
      requestCounts.set(key, count);

      // Check if limit is exceeded (default to 10 if not specified)
      const limit = options?.max || 10;
      if (count > limit) {
        return res.status(429).json({
          ok: false,
          error: 'Too Many Requests'
        });
      }

      next();
    };
  });
});

/** 
 * Create a fresh test server instance
 * Clears module cache to ensure clean state
 */
function createTestServer() {
  // Clear server module cache for fresh instance
  delete require.cache[require.resolve('../../server-v2')];
  
  // Clear route module caches
  const routeModules = [
    '../../auth/routes',
    '../../routes/usage',
    '../../routes/billing',
    '../../routes/licenses',
    '../../routes/license',
    '../../routes/organization',
    '../../routes/email',
    '../../src/routes/email'
  ];
  
  routeModules.forEach(modulePath => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (e) {
      // Module might not exist, ignore
    }
  });
  
  const app = require('../../server-v2');
  return app;
}

/**
 * Reset all test state - call this between tests
 */
function resetTestState() {
  // Clear all module caches
  Object.keys(require.cache).forEach(key => {
    if (key.includes('server-v2') || 
        key.includes('/routes/') || 
        key.includes('/auth/') ||
        key.includes('/services/')) {
      delete require.cache[key];
    }
  });
  
  // Reset all mocks
  const supabaseMock = require('../mocks/supabase.mock');
  const stripeMock = require('../mocks/stripe.mock');
  const resendMock = require('../mocks/resend.mock');
  const licenseServiceMock = require('../mocks/licenseService.mock');
  
  if (supabaseMock.__reset) supabaseMock.__reset();
  if (stripeMock.__resetStripe) stripeMock.__resetStripe();
  if (resendMock.__resetResend) resendMock.__resetResend();
  if (licenseServiceMock.__reset) licenseServiceMock.__reset();
  
  // Clear all Jest mocks
  jest.clearAllMocks();
}

module.exports = { 
  createTestServer,
  resetTestState
};
