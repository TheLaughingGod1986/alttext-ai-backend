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

let listenPatched = false;

// Cache for server instance to make createTestServer() idempotent
// This prevents unnecessary module cache clearing which can interfere with other tests
let cachedServer = null;
let cachedServerPath = null;

/** 
 * Create a test server instance
 * Idempotent: returns cached instance if available and valid, otherwise creates new one
 * Only clears module cache when necessary (e.g., module failed to load or returned invalid result)
 */
function createTestServer() {
  // Ensure NODE_ENV is set to test BEFORE any modules are loaded
  // This must happen first to ensure mocks are used
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
    // If NODE_ENV changed, invalidate cache
    cachedServer = null;
    cachedServerPath = null;
  }
  
  // Ensure Supertest binds to localhost instead of 0.0.0.0 (blocked in sandbox)
  if (!listenPatched) {
    const http = require('http');
    const originalServerListen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      // Normalize arguments so calls like listen(0) or listen(0, callback)
      // bind to 127.0.0.1 instead of 0.0.0.0
      if (typeof args[0] === 'number') {
        const port = args[0];
        const hasHost = typeof args[1] === 'string';
        const hasCallback = typeof args[1] === 'function' || typeof args[2] === 'function';
        const cb = typeof args[1] === 'function' ? args[1] : args[2];
        // If host already specified, respect it; otherwise force localhost
        if (!hasHost) {
          const server = originalServerListen.call(this, port, '127.0.0.1', cb);
          if (server && typeof server.unref === 'function') {
            server.unref();
          }
          // Always return the server, even if unref was called
          return server || this;
        }
      }
      return originalServerListen.apply(this, args);
    };
    listenPatched = true;
  }
  
  // Try to use cached server if available and valid
  if (cachedServer && typeof cachedServer.listen === 'function') {
    const serverPath = require.resolve('../../server-v2');
    // If the cached server is from the same module path, reuse it
    if (cachedServerPath === serverPath && require.cache[serverPath]) {
      return cachedServer;
    }
    // Otherwise, cache is stale, clear it
    cachedServer = null;
    cachedServerPath = null;
  }
  
  // Try to load server without clearing cache first
  let app;
  const serverPath = require.resolve('../../server-v2');
  
  try {
    // First attempt: try to use cached module if available
    if (require.cache[serverPath]) {
      app = require('../../server-v2');
    } else {
      // Module not in cache, require it (will be cached automatically)
      app = require('../../server-v2');
    }
    
    // Validate the app
    if (!app) {
      // Module returned null/undefined - clear cache and retry
      delete require.cache[serverPath];
      app = require('../../server-v2');
    }
    
    if (typeof app.listen !== 'function') {
      // Invalid app - clear cache and retry
      delete require.cache[serverPath];
      app = require('../../server-v2');
      
      // Validate again
      if (typeof app.listen !== 'function') {
        throw new Error('server-v2 module did not export an Express app (listen is not a function)');
      }
    }
    
    // Cache the valid server instance
    cachedServer = app;
    cachedServerPath = serverPath;
    
    return app;
  } catch (error) {
    // If loading failed, try clearing cache and retrying once
    if (require.cache[serverPath]) {
      try {
        delete require.cache[serverPath];
        // Also clear supabase-client cache to ensure mock is used
        try {
          const supabasePath = require.resolve('../../db/supabase-client');
          delete require.cache[supabasePath];
        } catch (e) {
          // Ignore if not found
        }
        
        app = require('../../server-v2');
        
        if (!app || typeof app.listen !== 'function') {
          throw new Error('server-v2 module did not export an Express app after cache clear');
        }
        
        // Cache the valid server instance
        cachedServer = app;
        cachedServerPath = serverPath;
        
        return app;
      } catch (retryError) {
        // Both attempts failed
        console.error('[createTestServer] Error loading server-v2 after retry:', retryError.message);
        throw new Error(`Failed to create test server: ${retryError.message}. This is likely due to a dependency issue with @supabase/storage-js.`);
      }
    } else {
      // No cache to clear, error is real
      console.error('[createTestServer] Error loading server-v2:', error.message);
      if (error.stack) {
        const stackLines = error.stack.split('\n');
        console.error('[createTestServer] Stack (first 20 lines):');
        stackLines.slice(0, 20).forEach(line => console.error('  ', line));
      }
      throw new Error(`Failed to create test server: ${error.message}. This is likely due to a dependency issue with @supabase/storage-js.`);
    }
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
