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

/** 
 * Create a fresh test server instance
 * Clears module cache to ensure clean state
 */
function createTestServer() {
  // Ensure NODE_ENV is set to test BEFORE any modules are loaded
  // This must happen first to ensure mocks are used
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
  }
  
  // Mock Supabase client BEFORE loading server-v2 to prevent dependency errors
  // The db/supabase-client.js will use the mock when NODE_ENV=test
  // But we need to ensure the mock is loaded first
  try {
    require('../mocks/supabase.mock');
  } catch (e) {
    // Mock might already be loaded, ignore
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
    '../../src/routes/email',
    '../../src/routes/analytics'
  ];
  
  routeModules.forEach(modulePath => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (e) {
      // Module might not exist, ignore
    }
  });
  
  try {
    // Force clear the cache and require fresh
    const serverPath = require.resolve('../../server-v2');
    delete require.cache[serverPath];
    
    // Clear the supabase-client cache to ensure mock is used
    try {
      const supabasePath = require.resolve('../../db/supabase-client');
      delete require.cache[supabasePath];
    } catch (e) {
      // Ignore if not found
    }
    
    const app = require('../../server-v2');
    
    // Debug logging
    if (!app) {
      console.error('[createTestServer] server-v2 module returned null/undefined');
      const mod = require.cache[serverPath];
      console.error('[createTestServer] Module in cache:', mod ? 'exists' : 'missing');
      if (mod && mod.exports) {
        console.error('[createTestServer] Module exports type:', typeof mod.exports);
        console.error('[createTestServer] Module exports keys:', Object.keys(mod.exports || {}).slice(0, 10));
      }
      throw new Error('server-v2 module returned null/undefined');
    }
    
    if (typeof app.listen !== 'function') {
      console.error('[createTestServer] app.listen is not a function');
      console.error('[createTestServer] app type:', typeof app);
      console.error('[createTestServer] app value:', app);
      console.error('[createTestServer] app keys:', Object.keys(app || {}).slice(0, 10));
      throw new Error('server-v2 module did not export an Express app (listen is not a function)');
    }
    
    return app;
  } catch (error) {
    console.error('[createTestServer] Error loading server-v2:', error.message);
    console.error('[createTestServer] Error name:', error.name);
    if (error.stack) {
      const stackLines = error.stack.split('\n');
      console.error('[createTestServer] Stack (first 20 lines):');
      stackLines.slice(0, 20).forEach(line => console.error('  ', line));
    }
    // Re-throw with more context
    throw new Error(`Failed to create test server: ${error.message}. This is likely due to a dependency issue with @supabase/storage-js. Original error: ${error.name}`);
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
