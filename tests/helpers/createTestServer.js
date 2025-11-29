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

let listenPatched = false;

/** 
 * Create a fresh test server instance
 * Clears module cache to ensure clean state
 */
function createTestServer() {
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
          return server;
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
