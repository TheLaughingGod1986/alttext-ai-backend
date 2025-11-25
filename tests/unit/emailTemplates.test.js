/**
 * Unit tests for email templates
 */

describe('emailTemplates', () => {
  const MODULE_PATH = '../../src/emails/templates';

  beforeEach(() => {
    // Set default env vars for tests
    process.env.BRAND_NAME = 'TestBrand';
    process.env.BRAND_DOMAIN = 'test.com';
    process.env.SUPPORT_EMAIL = 'support@test.com';
    process.env.FRONTEND_DASHBOARD_URL = 'https://app.test.com';
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.BRAND_NAME;
    delete process.env.BRAND_DOMAIN;
    delete process.env.SUPPORT_EMAIL;
    delete process.env.FRONTEND_DASHBOARD_URL;
  });

  describe('welcomeWaitlistEmail', () => {
    test('returns email with subject, html, and text', () => {
      const { welcomeWaitlistEmail } = require(MODULE_PATH);
      const result = welcomeWaitlistEmail({ email: 'test@example.com', source: 'website' });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    test('subject contains brand name', () => {
      const { welcomeWaitlistEmail } = require(MODULE_PATH);
      const result = welcomeWaitlistEmail({ email: 'test@example.com' });

      expect(result.subject).toContain('TestBrand');
    });

    test('html contains brand name and waitlist content', () => {
      const { welcomeWaitlistEmail } = require(MODULE_PATH);
      const result = welcomeWaitlistEmail({ email: 'test@example.com' });

      expect(result.html).toContain('TestBrand');
      expect(result.html).toContain('waitlist');
    });

    test('does not throw with required data', () => {
      const { welcomeWaitlistEmail } = require(MODULE_PATH);

      expect(() => {
        welcomeWaitlistEmail({ email: 'test@example.com' });
      }).not.toThrow();
    });
  });

  describe('welcomeDashboardEmail', () => {
    test('returns email with subject, html, and text', () => {
      const { welcomeDashboardEmail } = require(MODULE_PATH);
      const result = welcomeDashboardEmail({ email: 'test@example.com' });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    test('subject contains brand name', () => {
      const { welcomeDashboardEmail } = require(MODULE_PATH);
      const result = welcomeDashboardEmail({ email: 'test@example.com' });

      expect(result.subject).toContain('TestBrand');
    });

    test('html contains dashboard URL', () => {
      const { welcomeDashboardEmail } = require(MODULE_PATH);
      const result = welcomeDashboardEmail({ email: 'test@example.com' });

      expect(result.html).toContain('app.test.com');
    });
  });

  describe('licenseActivatedEmail', () => {
    test('returns email with subject, html, and text', () => {
      const { licenseActivatedEmail } = require(MODULE_PATH);
      const result = licenseActivatedEmail({
        email: 'test@example.com',
        planName: 'Pro',
      });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    test('subject contains plan name', () => {
      const { licenseActivatedEmail } = require(MODULE_PATH);
      const result = licenseActivatedEmail({
        email: 'test@example.com',
        planName: 'Pro',
      });

      expect(result.subject).toContain('Pro');
    });

    test('html contains plan name and site URL when provided', () => {
      const { licenseActivatedEmail } = require(MODULE_PATH);
      const result = licenseActivatedEmail({
        email: 'test@example.com',
        planName: 'Pro',
        siteUrl: 'https://example.com',
      });

      expect(result.html).toContain('Pro');
      expect(result.html).toContain('example.com');
    });
  });

  describe('lowCreditWarningEmail', () => {
    test('returns email with subject, html, and text', () => {
      const { lowCreditWarningEmail } = require(MODULE_PATH);
      const result = lowCreditWarningEmail({
        email: 'test@example.com',
        remainingCredits: 10,
      });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    test('subject contains remaining credits', () => {
      const { lowCreditWarningEmail } = require(MODULE_PATH);
      const result = lowCreditWarningEmail({
        email: 'test@example.com',
        remainingCredits: 10,
      });

      expect(result.subject).toContain('10');
    });

    test('html contains remaining credits number', () => {
      const { lowCreditWarningEmail } = require(MODULE_PATH);
      const result = lowCreditWarningEmail({
        email: 'test@example.com',
        remainingCredits: 10,
      });

      expect(result.html).toContain('10');
    });

    test('html contains plugin name when provided', () => {
      const { lowCreditWarningEmail } = require(MODULE_PATH);
      const result = lowCreditWarningEmail({
        email: 'test@example.com',
        remainingCredits: 10,
        pluginName: 'AltText AI',
      });

      expect(result.html).toContain('AltText AI');
    });
  });

  describe('receiptEmail', () => {
    test('returns email with subject, html, and text', () => {
      const { receiptEmail } = require(MODULE_PATH);
      const result = receiptEmail({
        email: 'test@example.com',
        amount: 29.99,
        planName: 'Pro',
      });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    test('subject contains formatted amount', () => {
      const { receiptEmail } = require(MODULE_PATH);
      const result = receiptEmail({
        email: 'test@example.com',
        amount: 29.99,
        planName: 'Pro',
      });

      expect(result.subject).toContain('$29.99');
    });

    test('html contains amount and plan name', () => {
      const { receiptEmail } = require(MODULE_PATH);
      const result = receiptEmail({
        email: 'test@example.com',
        amount: 29.99,
        planName: 'Pro',
      });

      expect(result.html).toContain('$29.99');
      expect(result.html).toContain('Pro');
    });

    test('html contains invoice URL when provided', () => {
      const { receiptEmail } = require(MODULE_PATH);
      const result = receiptEmail({
        email: 'test@example.com',
        amount: 29.99,
        planName: 'Pro',
        invoiceUrl: 'https://example.com/invoice/123',
      });

      expect(result.html).toContain('invoice/123');
    });
  });

  describe('pluginSignupEmail', () => {
    test('returns email with subject, html, and text', () => {
      const { pluginSignupEmail } = require(MODULE_PATH);
      const result = pluginSignupEmail({
        email: 'test@example.com',
        pluginName: 'AltText AI',
      });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('text');
    });

    test('subject contains plugin name', () => {
      const { pluginSignupEmail } = require(MODULE_PATH);
      const result = pluginSignupEmail({
        email: 'test@example.com',
        pluginName: 'AltText AI',
      });

      expect(result.subject).toContain('AltText AI');
    });

    test('html contains plugin name and site URL when provided', () => {
      const { pluginSignupEmail } = require(MODULE_PATH);
      const result = pluginSignupEmail({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
      });

      expect(result.html).toContain('AltText AI');
      expect(result.html).toContain('example.com');
    });
  });
});

