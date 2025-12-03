const mockAuthEmail = {
  sendWelcomeEmail: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve())
};

// Ensure NODE_ENV is test before any mocks
if (process.env.NODE_ENV !== 'test') {
  process.env.NODE_ENV = 'test';
}

// Note: @supabase/supabase-js and db/supabase-client mocks are in jest.setup.js
// for early hoisting. Do not duplicate them here to avoid circular imports and
// module initialization issues.
jest.mock('stripe', () => require('./stripe.mock'));
jest.mock('resend', () => require('./resend.mock'));
jest.mock('../../src/services/licenseService', () => require('./licenseService.mock'));
// auth/email.js is deprecated - use src/services/emailService instead
// Keeping mock for backward compatibility with tests that still reference it
jest.mock('../../auth/email', () => mockAuthEmail);

afterEach(() => {
  // Clear all Jest mocks first
  jest.clearAllMocks();
  
  // Reset all mock stores and instances
  const supabaseMock = require('./supabase.mock');
  const stripeMock = require('./stripe.mock');
  const resendMock = require('./resend.mock');
  const licenseServiceMock = require('./licenseService.mock');
  
  if (typeof supabaseMock.__reset === 'function') {
    supabaseMock.__reset();
  }
  if (typeof stripeMock.__resetStripe === 'function') {
    stripeMock.__resetStripe();
  }
  if (typeof resendMock.__resetResend === 'function') {
    resendMock.__resetResend();
  }
  if (typeof licenseServiceMock.__reset === 'function') {
    licenseServiceMock.__reset();
  }
  
  // Reset auth email mocks
  mockAuthEmail.sendWelcomeEmail.mockClear().mockResolvedValue();
  mockAuthEmail.sendPasswordResetEmail.mockClear().mockResolvedValue();
  
  // Note: Module cache clearing removed to prevent interference with createTestServer()
  // The createTestServer() function now handles caching and only clears cache when necessary
  // Clearing server-v2 cache here was causing subsequent tests to fail
});

