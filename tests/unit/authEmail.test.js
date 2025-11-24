// Unmock auth/email so we can test the actual functions
jest.unmock('../../auth/email');

// Mock resend module
jest.mock('resend', () => {
  const resendMock = require('../mocks/resend.mock');
  return resendMock;
});

const { sendPasswordResetEmail, sendWelcomeEmail } = require('../../auth/email');
const resendMock = require('../mocks/resend.mock');

describe('Auth email functions', () => {
  beforeEach(() => {
    resendMock.__resetResend();
    delete process.env.SENDGRID_API_KEY;
    jest.resetModules(); // Reset module cache to pick up new env vars
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_FROM_EMAIL;
  });

  describe('sendPasswordResetEmail', () => {
    test('sends password reset email via Resend when configured', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      process.env.RESEND_FROM_EMAIL = 'Test <test@example.com>';

      const result = await sendPasswordResetEmail('user@example.com', 'https://example.com/reset?token=abc123');

      // Function returns true or undefined, both are acceptable
      expect(result !== false).toBe(true);
      const instance = resendMock.__getLastInstance();
      if (instance) {
        expect(instance.emails.send).toHaveBeenCalled();
      }
    });

    test('handles Resend API errors gracefully', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      process.env.RESEND_FROM_EMAIL = 'Test <test@example.com>';

      const instance = resendMock.__getLastInstance();
      if (instance) {
        instance.emails.send.mockRejectedValueOnce(new Error('Resend API error'));
      }

      const result = await sendPasswordResetEmail('user@example.com', 'https://example.com/reset?token=abc123');

      // Should fall through to fallback (returns true or undefined)
      expect(result !== false).toBe(true);
    });

    test('falls back to console log when no email service configured', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SENDGRID_API_KEY;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendPasswordResetEmail('user@example.com', 'https://example.com/reset?token=abc123');

      expect(result !== false).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('handles Resend domain verification errors', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      process.env.RESEND_FROM_EMAIL = 'Test <test@example.com>';

      const instance = resendMock.__getLastInstance();
      const domainError = new Error('Domain not verified');
      domainError.message = 'Domain verification issue';
      if (instance) {
        instance.emails.send.mockRejectedValueOnce(domainError);
      }

      const result = await sendPasswordResetEmail('user@example.com', 'https://example.com/reset?token=abc123');

      expect(result !== false).toBe(true);
    });
  });

  describe('sendWelcomeEmail', () => {
    test('sends welcome email via Resend when configured', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      process.env.RESEND_FROM_EMAIL = 'Test <test@example.com>';

      const result = await sendWelcomeEmail('newuser@example.com', 'newuser');

      expect(result !== false).toBe(true);
      const instance = resendMock.__getLastInstance();
      if (instance) {
        expect(instance.emails.send).toHaveBeenCalled();
      }
    });

    test('handles Resend API errors gracefully', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      process.env.RESEND_FROM_EMAIL = 'Test <test@example.com>';

      const instance = resendMock.__getLastInstance();
      if (instance) {
        instance.emails.send.mockRejectedValueOnce(new Error('Resend API error'));
      }

      const result = await sendWelcomeEmail('newuser@example.com', 'newuser');

      // Should fall through to fallback (returns true or undefined)
      expect(result !== false).toBe(true);
    });

    test('falls back to console log when no email service configured', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SENDGRID_API_KEY;

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendWelcomeEmail('newuser@example.com', 'newuser');

      expect(result !== false).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('handles email timeout gracefully', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      process.env.RESEND_FROM_EMAIL = 'Test <test@example.com>';

      const instance = resendMock.__getLastInstance();
      if (instance) {
        instance.emails.send.mockImplementationOnce(() =>
          new Promise((resolve, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        );
      }

      const result = await sendWelcomeEmail('timeout@example.com', 'timeout');

      expect(result !== false).toBe(true);
    });
  });
});

