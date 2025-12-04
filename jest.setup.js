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
// CRITICAL: Provide inline factory instead of relying on __mocks__ directory
// This must be here to ensure it's applied before any route files are loaded
jest.mock('express-rate-limit', () => {
  // Create the mock factory function that ALWAYS returns a valid, NO-OP middleware instance
  function mockRateLimiter(options = {}) {
    // Log to verify mock is being used
    console.log('[MOCK] express-rate-limit mock is being used! Options:', Object.keys(options || {}));

    // Return a NEW middleware function instance every time
    // This prevents issues with Express rejecting reused middleware
    // CRITICAL: This middleware does NOTHING - no rate limiting at all
    const middleware = (req, res, next) => {
      // ALWAYS skip rate limiting in tests - just call next()
      if (typeof next === 'function') {
        next();
      }
    };

    // Add properties that express-rate-limit middleware might have
    middleware.resetKey = () => {};
    middleware.getKey = () => 'test-key';

    return middleware;
  }

  // Ensure the mock always returns a function, even if called incorrectly
  mockRateLimiter.default = mockRateLimiter;
  mockRateLimiter.rateLimit = mockRateLimiter;

  // Return as both default and named export to handle all import styles
  return mockRateLimiter;
});

// Mock auth/jwt module globally but preserve actual implementation for non-middleware functions
// This ensures authenticateToken and optionalAuth work in tests while keeping real token functions
jest.mock('./auth/jwt', () => {
  // Load the actual module for real implementations
  const actualJwt = jest.requireActual('./auth/jwt');

  // Return real implementations for utility functions, but mock the middleware
  return {
    ...actualJwt,
    // Only mock the middleware functions to avoid authentication in tests
    authenticateToken: jest.fn((req, res, next) => {
      // Set a default user if not set by test
      if (!req.user) {
        req.user = { id: 1, email: 'test@example.com', plan: 'free' };
      }
      next();
    }),
    optionalAuth: jest.fn((req, res, next) => next()),
  };
});

