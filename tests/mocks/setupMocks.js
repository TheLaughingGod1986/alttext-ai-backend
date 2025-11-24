const mockAuthEmail = {
  sendWelcomeEmail: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve())
};

jest.mock('../../db/supabase-client', () => require('./supabase.mock'));
jest.mock('stripe', () => require('./stripe.mock'));
jest.mock('resend', () => require('./resend.mock'));
jest.mock('../../services/licenseService', () => require('./licenseService.mock'));
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
  
  // Reset modules to prevent state bleeding
  // Note: jest.resetModules() is called selectively to avoid breaking mocks
  // We only reset specific modules that might hold state
  const modulesToReset = [
    '../../server-v2',
    '../../routes/usage',
    '../../routes/billing',
    '../../routes/licenses',
    '../../routes/license'
  ];
  
  modulesToReset.forEach(modulePath => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (e) {
      // Module might not be loaded yet, ignore
    }
  });
});

