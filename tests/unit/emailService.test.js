/**
 * Unit tests for emailService (new implementation)
 */

describe('emailService (new)', () => {
  const MODULE_PATH = '../../src/services/emailService';

  let mockResendClient;
  let mockTemplates;
  let mockEmailEventService;
  let mockPluginInstallationService;

  beforeEach(() => {
    jest.resetModules();

    // Mock resendClient
    mockResendClient = {
      sendEmail: jest.fn(),
    };
    jest.mock('../../src/utils/resendClient', () => ({
      sendEmail: mockResendClient.sendEmail,
    }));

    // Mock emailEventService
    mockEmailEventService = {
      hasRecentEvent: jest.fn().mockResolvedValue(false),
      hasRecentEventForPlugin: jest.fn().mockResolvedValue(false),
      logEvent: jest.fn().mockResolvedValue({ success: true }),
    };
    jest.mock('../../src/services/emailEventService', () => mockEmailEventService);

    // Mock pluginInstallationService
    mockPluginInstallationService = {
      recordInstallation: jest.fn().mockResolvedValue({ success: true, record: { id: '123' } }),
    };
    jest.mock('../../src/services/pluginInstallationService', () => mockPluginInstallationService);

    // Mock templates
    mockTemplates = {
      welcomeWaitlistEmail: jest.fn().mockReturnValue({
        subject: 'Welcome!',
        html: '<p>Welcome</p>',
        text: 'Welcome',
      }),
      welcomeDashboardEmail: jest.fn().mockReturnValue({
        subject: 'Welcome!',
        html: '<p>Welcome</p>',
        text: 'Welcome',
      }),
      licenseActivatedEmail: jest.fn().mockReturnValue({
        subject: 'License Activated',
        html: '<p>License</p>',
        text: 'License',
      }),
      lowCreditWarningEmail: jest.fn().mockReturnValue({
        subject: 'Low Credits',
        html: '<p>Low</p>',
        text: 'Low',
      }),
      receiptEmail: jest.fn().mockReturnValue({
        subject: 'Receipt',
        html: '<p>Receipt</p>',
        text: 'Receipt',
      }),
      pluginSignupEmail: jest.fn().mockReturnValue({
        subject: 'Plugin Signup',
        html: '<p>Plugin</p>',
        text: 'Plugin',
      }),
    };
    jest.mock('../../src/emails/templates', () => mockTemplates);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendWaitlistWelcome', () => {
    test('calls template with correct parameters', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendWaitlistWelcome } = require(MODULE_PATH);

      await sendWaitlistWelcome({
        email: 'test@example.com',
        plugin: 'AltText AI',
        source: 'website',
      });

      expect(mockTemplates.welcomeWaitlistEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        source: 'website',
      });
    });

    test('calls resendClient with template output and tags', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendWaitlistWelcome } = require(MODULE_PATH);

      await sendWaitlistWelcome({
        email: 'test@example.com',
        plugin: 'AltText AI',
        source: 'website',
      });

      expect(mockResendClient.sendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Welcome!',
        html: '<p>Welcome</p>',
        text: 'Welcome',
        tags: [
          { name: 'event', value: 'waitlist_signup' },
          { name: 'plugin', value: 'AltText AI' },
          { name: 'source', value: 'website' },
        ],
      });
    });

    test('returns success when email sent', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendWaitlistWelcome } = require(MODULE_PATH);

      const result = await sendWaitlistWelcome({
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email_123');
    });

    test('handles resend errors gracefully', async () => {
      mockResendClient.sendEmail.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
      });
      const { sendWaitlistWelcome } = require(MODULE_PATH);

      const result = await sendWaitlistWelcome({
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    test('handles exceptions', async () => {
      mockResendClient.sendEmail.mockRejectedValue(new Error('Network error'));
      const { sendWaitlistWelcome } = require(MODULE_PATH);

      const result = await sendWaitlistWelcome({
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('sendDashboardWelcome', () => {
    test('calls template and resendClient correctly', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendDashboardWelcome } = require(MODULE_PATH);

      await sendDashboardWelcome({
        email: 'test@example.com',
      });

      expect(mockTemplates.welcomeDashboardEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
      expect(mockResendClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          tags: [{ name: 'event', value: 'dashboard_welcome' }],
        })
      );
    });
  });

  describe('sendLicenseActivated', () => {
    test('calls template and resendClient with plan tags', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendLicenseActivated } = require(MODULE_PATH);

      await sendLicenseActivated({
        email: 'test@example.com',
        planName: 'Pro',
        siteUrl: 'https://example.com',
      });

      expect(mockTemplates.licenseActivatedEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        planName: 'Pro',
        siteUrl: 'https://example.com',
      });
      expect(mockResendClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining([
            { name: 'event', value: 'license_activated' },
            { name: 'plan', value: 'pro' },
            { name: 'site_url', value: 'https://example.com' },
          ]),
        })
      );
    });
  });

  describe('sendLowCreditWarning', () => {
    test('calls template and resendClient with credits info', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendLowCreditWarning } = require(MODULE_PATH);

      await sendLowCreditWarning({
        email: 'test@example.com',
        remainingCredits: 10,
        pluginName: 'AltText AI',
      });

      expect(mockTemplates.lowCreditWarningEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        remainingCredits: 10,
        pluginName: 'AltText AI',
      });
      expect(mockResendClient.sendEmail).toHaveBeenCalled();
    });
  });

  describe('sendReceipt', () => {
    test('calls template and resendClient with receipt data', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendReceipt } = require(MODULE_PATH);

      await sendReceipt({
        email: 'test@example.com',
        amount: 29.99,
        planName: 'Pro',
        invoiceUrl: 'https://example.com/invoice',
      });

      expect(mockTemplates.receiptEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        amount: 29.99,
        planName: 'Pro',
        invoiceUrl: 'https://example.com/invoice',
      });
      expect(mockResendClient.sendEmail).toHaveBeenCalled();
    });
  });

  describe('sendPluginSignup', () => {
    test('calls template and resendClient with plugin info', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendPluginSignup } = require(MODULE_PATH);

      await sendPluginSignup({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
      });

      expect(mockTemplates.pluginSignupEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
      });
      expect(mockResendClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining([
            { name: 'event', value: 'plugin_signup' },
            { name: 'plugin', value: 'AltText AI' },
          ]),
        })
      );
      expect(mockEmailEventService.logEvent).toHaveBeenCalled();
    });

    test('returns deduplicated response when recent event exists', async () => {
      mockEmailEventService.hasRecentEventForPlugin.mockResolvedValue(true);
      const { sendPluginSignup } = require(MODULE_PATH);

      const result = await sendPluginSignup({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.deduped).toBe(true);
      expect(mockResendClient.sendEmail).not.toHaveBeenCalled();
      expect(mockEmailEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          pluginSlug: 'AltText AI',
          eventType: 'plugin_signup',
          context: expect.objectContaining({ deduped: true }),
          success: true,
        })
      );
    });

    test('handles resend failure gracefully', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: false, error: 'Rate limit exceeded' });
      const { sendPluginSignup } = require(MODULE_PATH);

      const result = await sendPluginSignup({
        email: 'test@example.com',
        pluginName: 'AltText AI',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
      expect(mockEmailEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorMessage: 'Rate limit exceeded',
        })
      );
    });

    test('records plugin installation when sending signup email', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      const { sendPluginSignup } = require(MODULE_PATH);

      await sendPluginSignup({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
        meta: {
          version: '1.0.0',
          wpVersion: '6.0',
          phpVersion: '8.0',
          language: 'en_US',
          timezone: 'America/New_York',
          installSource: 'website',
        },
      });

      // Wait a bit for the async recordInstallation call
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockPluginInstallationService.recordInstallation).toHaveBeenCalledWith({
        email: 'test@example.com',
        plugin: 'AltText AI',
        site: 'https://example.com',
        version: '1.0.0',
        wpVersion: '6.0',
        phpVersion: '8.0',
        language: 'en_US',
        timezone: 'America/New_York',
        installSource: 'website',
      });
    });

    test('does not record installation when email is deduped', async () => {
      mockEmailEventService.hasRecentEventForPlugin.mockResolvedValue(true);
      const { sendPluginSignup } = require(MODULE_PATH);

      await sendPluginSignup({
        email: 'test@example.com',
        pluginName: 'AltText AI',
      });

      // Wait a bit to ensure no async calls
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockPluginInstallationService.recordInstallation).not.toHaveBeenCalled();
    });

    test('does not fail email sending if installation recording fails', async () => {
      mockResendClient.sendEmail.mockResolvedValue({ success: true, id: 'email_123' });
      mockPluginInstallationService.recordInstallation.mockRejectedValue(new Error('Installation recording failed'));
      const { sendPluginSignup } = require(MODULE_PATH);

      const result = await sendPluginSignup({
        email: 'test@example.com',
        pluginName: 'AltText AI',
      });

      // Wait a bit for the async recordInstallation call
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email_123');
    });
  });
});
