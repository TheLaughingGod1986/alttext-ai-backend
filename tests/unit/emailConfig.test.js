/**
 * Unit tests for emailConfig
 */

describe('emailConfig', () => {
  const MODULE_PATH = '../../src/emails/emailConfig';

  beforeEach(() => {
    // Reset environment variables
    delete process.env.BRAND_NAME;
    delete process.env.EMAIL_BRAND_NAME;
    delete process.env.BRAND_DOMAIN;
    delete process.env.SUPPORT_EMAIL;
    delete process.env.FRONTEND_DASHBOARD_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.PUBLIC_API_DOMAIN;
    delete process.env.EMAIL_FROM;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.TRANSACTIONAL_FROM_EMAIL;
    delete process.env.BILLING_FROM_EMAIL;
    jest.resetModules();
  });

  test('returns default values when env vars not set', () => {
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.brandName).toBe('AltText AI');
    expect(config.brandDomain).toBe('optti.dev');
    expect(config.supportEmail).toBe('support@optti.dev');
    expect(config.dashboardUrl).toBe('https://app.optti.dev');
    expect(config.publicApiDomain).toBe('api.optti.dev');
    expect(config.transactionalFromEmail).toContain('AltText AI');
    expect(config.transactionalFromEmail).toContain('hello@optti.dev');
    expect(config.billingFromEmail).toContain('AltText AI');
    expect(config.billingFromEmail).toContain('billing@optti.dev');
  });

  test('uses BRAND_NAME when set', () => {
    process.env.BRAND_NAME = 'OpttiAI';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.brandName).toBe('OpttiAI');
  });

  test('falls back to EMAIL_BRAND_NAME if BRAND_NAME not set', () => {
    process.env.EMAIL_BRAND_NAME = 'AltText AI';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.brandName).toBe('AltText AI');
  });

  test('uses BRAND_DOMAIN when set', () => {
    process.env.BRAND_DOMAIN = 'example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.brandDomain).toBe('example.com');
  });

  test('uses SUPPORT_EMAIL when set', () => {
    process.env.SUPPORT_EMAIL = 'help@example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.supportEmail).toBe('help@example.com');
  });

  test('uses FRONTEND_DASHBOARD_URL when set', () => {
    process.env.FRONTEND_DASHBOARD_URL = 'https://dashboard.example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.dashboardUrl).toBe('https://dashboard.example.com');
  });

  test('falls back to FRONTEND_URL if FRONTEND_DASHBOARD_URL not set', () => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.dashboardUrl).toBe('https://app.example.com');
  });

  test('uses PUBLIC_API_DOMAIN when set', () => {
    process.env.PUBLIC_API_DOMAIN = 'api.example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.publicApiDomain).toBe('api.example.com');
  });

  test('provides direct property access', () => {
    process.env.BRAND_NAME = 'TestBrand';
    const emailConfig = require(MODULE_PATH);

    expect(emailConfig.brandName).toBe('TestBrand');
    expect(emailConfig.brandDomain).toBe('optti.dev');
  });

  test('uses TRANSACTIONAL_FROM_EMAIL when set', () => {
    process.env.TRANSACTIONAL_FROM_EMAIL = 'transactions@example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.transactionalFromEmail).toBe('transactions@example.com');
  });

  test('uses BILLING_FROM_EMAIL when set', () => {
    process.env.BILLING_FROM_EMAIL = 'billing@example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.billingFromEmail).toBe('billing@example.com');
  });

  test('falls back to EMAIL_FROM for transactionalFromEmail', () => {
    process.env.EMAIL_FROM = 'noreply@example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.transactionalFromEmail).toBe('noreply@example.com');
  });

  test('falls back to EMAIL_FROM for billingFromEmail', () => {
    process.env.EMAIL_FROM = 'noreply@example.com';
    const { getEmailConfig } = require(MODULE_PATH);
    const config = getEmailConfig();

    expect(config.billingFromEmail).toBe('noreply@example.com');
  });
});

