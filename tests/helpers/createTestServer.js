/**
 * Mock express-rate-limit globally for all tests
 * This prevents real rate limiting from running during tests
 * Must be at top level for Jest hoisting
 */
jest.mock('express-rate-limit', () => {
  return jest.fn(() => {
    // Return a middleware function that just calls next() - no rate limiting
    return (req, res, next) => next();
  });
});

/**
 * Mock db/supabase-client globally for all tests
 * This prevents the real Supabase client from loading, which causes
 * dependency errors with @supabase/storage-js in test environment
 * Must be at top level for Jest hoisting
 */
jest.mock('../../db/supabase-client', () => {
  // Ensure NODE_ENV is test before requiring the mock
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
  }
  return require('../mocks/supabase.mock');
});

// Don't mock organization routes - use the real routes
// The module loading issue was fixed by clearing cache and ensuring authenticateToken is loaded

const http = require('http');
// Don't require createApp at module level - require it inside the function
// This prevents module caching issues with the mock state

/** 
 * Create a test server instance
 * Returns an HTTP Server instance (not Express app) for Supertest compatibility
 * Supertest requires an HTTP Server with address() method, not an Express app
 */
function createTestServer() {
  // Ensure NODE_ENV is set to test BEFORE any modules are loaded
  // This must happen first to ensure mocks are used
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
  }
  
  try {
    // Simply require createApp - don't clear cache
    // The factory function createApp() returns a fresh Express app instance each time
    // This avoids cache clearing issues that cause authenticateToken to be undefined
    const createApp = require('../../server-v2');
    
    // Validate createApp is a function
    if (typeof createApp !== 'function') {
      throw new Error(`createApp is not a function. Type: ${typeof createApp}`);
    }
    
    // Create a fresh Express app instance using the factory
    const app = createApp();
    
    // Validate the app
    if (!app || typeof app.listen !== 'function') {
      throw new Error('createApp did not return a valid Express app');
    }
    
    // Create HTTP server from Express app
    // This is what Supertest needs - an HTTP Server instance, not an Express app
    const server = http.createServer(app);
    
    // Start server on random available port (0 = OS chooses)
    // This allows Supertest to get the server address via server.address()
    server.listen(0);
    
    return server;
  } catch (error) {
    console.error('[createTestServer] Error creating test server:', error.message);
    if (error.stack) {
      const stackLines = error.stack.split('\n');
      console.error('[createTestServer] Stack (first 20 lines):');
      stackLines.slice(0, 20).forEach(line => console.error('  ', line));
    }
    throw new Error(`Failed to create test server: ${error.message}`);
  }
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
