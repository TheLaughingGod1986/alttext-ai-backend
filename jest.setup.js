/**
 * Jest setup file - runs before all tests (in setupFiles, before setupFilesAfterEnv)
 * This ensures mocks are set up before any modules are loaded
 */

// Ensure NODE_ENV is test BEFORE any modules load
process.env.NODE_ENV = 'test';

// Mock @supabase/supabase-js directly to prevent storage-js from loading
// This prevents the "Class extends value" error from @supabase/storage-js
// This MUST be in setupFiles (not setupFilesAfterEnv) to be hoisted before module loading
jest.mock('@supabase/supabase-js', () => {
  // Return a mock createClient that returns the supabase mock
  // We can't require the mock here as it might cause circular issues
  // Instead, return a factory that will be called later
  return {
    createClient: jest.fn(() => {
      // When createClient is called, return the mocked supabase instance
      const supabaseMock = require('./tests/mocks/supabase.mock');
      return supabaseMock.supabase;
    })
  };
});

// Mock db/supabase-client globally to prevent real Supabase client from loading
// This prevents the "Class extends value" error from @supabase/storage-js
// This must be here (not in setupFilesAfterEnv) to ensure it's applied before server-v2 loads
jest.mock('./db/supabase-client', () => {
  // Return the mock directly - don't require it here to avoid circular issues
  const mock = require('./tests/mocks/supabase.mock');
  return mock;
});

// Mock express-rate-limit globally for all tests
// This prevents real rate limiting from running during tests
// Must be at top level for Jest hoisting - placed here to ensure it loads before routes
jest.mock('express-rate-limit', () => {
  // Return a function that directly returns a middleware function
  // This matches the actual express-rate-limit API: rateLimit(options) returns middleware
  const mockMiddleware = (req, res, next) => {
    // Always call next() to continue the request
    if (typeof next === 'function') {
      next();
    }
  };
  
  // Create the mock function that always returns a valid middleware
  const mockRateLimiter = function(options) {
    // Always return a valid middleware function, no matter what
    return mockMiddleware;
  };
  
  // Ensure the mock always returns a function, even if called incorrectly
  mockRateLimiter.default = mockRateLimiter;
  
  // Also export as default for ES6 imports
  // Make it a jest.fn so it can be tracked
  return jest.fn(mockRateLimiter);
});

