/**
 * Integration tests for email routes (new implementation)
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const { createTestToken } = require('../helpers/testHelpers');

// Mock emailService at top level for Jest hoisting
jest.mock('../../src/services/emailService', () => ({
  sendWaitlistWelcome: jest.fn(),
  sendDashboardWelcome: jest.fn(),
  sendLicenseActivated: jest.fn(),
  sendLowCreditWarning: jest.fn(),
  sendReceipt: jest.fn(),
  sendPluginSignup: jest.fn(),
}));

describe('Email Routes (new)', () => {
  let app;
  let mockEmailService;

  beforeAll(() => {
    app = createTestServer();
    mockEmailService = require('../../src/services/emailService');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default to success
    mockEmailService.sendWaitlistWelcome.mockResolvedValue({ success: true, emailId: 'email_123' });
    mockEmailService.sendDashboardWelcome.mockResolvedValue({ success: true, emailId: 'email_123' });
    mockEmailService.sendLicenseActivated.mockResolvedValue({ success: true, emailId: 'email_123' });
    mockEmailService.sendLowCreditWarning.mockResolvedValue({ success: true, emailId: 'email_123' });
    mockEmailService.sendReceipt.mockResolvedValue({ success: true, emailId: 'email_123' });
    mockEmailService.sendPluginSignup.mockResolvedValue({ success: true, emailId: 'email_123' });
  });

  describe('POST /email/waitlist', () => {
    test('sends waitlist welcome email with valid data', async () => {
      const res = await request(app)
        .post('/email/waitlist')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
          source: 'website',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendWaitlistWelcome).toHaveBeenCalledWith({
        email: 'test@example.com',
        plugin: 'AltText AI',
        source: 'website',
      });
    });

    test('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/email/waitlist')
        .send({
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Email is required');
    });

    test('returns 400 when email format is invalid', async () => {
      const res = await request(app)
        .post('/email/waitlist')
        .send({
          email: 'invalid-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid email format');
    });

    test('returns 500 when email service fails', async () => {
      mockEmailService.sendWaitlistWelcome.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
      });

      const res = await request(app)
        .post('/email/waitlist')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Rate limit exceeded');
    });

    test('returns deduplication response when email is deduped', async () => {
      mockEmailService.sendWaitlistWelcome.mockResolvedValue({ success: true, deduped: true });
      
      const res = await request(app)
        .post('/email/waitlist')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deduped).toBe(true);
    });
  });

  describe('POST /email/dashboard-welcome', () => {
    test('sends dashboard welcome email with valid data', async () => {
      const res = await request(app)
        .post('/email/dashboard-welcome')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendDashboardWelcome).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });

    test('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/email/dashboard-welcome')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('returns deduplication response when email is deduped', async () => {
      mockEmailService.sendDashboardWelcome.mockResolvedValue({ success: true, deduped: true });
      
      const res = await request(app)
        .post('/email/dashboard-welcome')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deduped).toBe(true);
    });
  });

  describe('POST /email/plugin-signup', () => {
    test('sends plugin signup email with valid data', async () => {
      const res = await request(app)
        .post('/email/plugin-signup')
        .send({
          email: 'test@example.com',
          pluginName: 'AltText AI',
          siteUrl: 'https://example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendPluginSignup).toHaveBeenCalledWith({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
      });
    });

    test('returns 400 when pluginName is missing', async () => {
      const res = await request(app)
        .post('/email/plugin-signup')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Plugin name is required');
    });

    test('returns deduplication response when email is deduped', async () => {
      mockEmailService.sendPluginSignup.mockResolvedValue({ success: true, deduped: true });
      
      const res = await request(app)
        .post('/email/plugin-signup')
        .send({
          email: 'test@example.com',
          pluginName: 'AltText AI',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deduped).toBe(true);
    });

    test('supports both plugin and pluginName parameters', async () => {
      const res = await request(app)
        .post('/email/plugin-signup')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendPluginSignup).toHaveBeenCalledWith({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: undefined,
      });
    });

    test('validates email format with Zod', async () => {
      const res = await request(app)
        .post('/email/plugin-signup')
        .send({
          email: 'invalid-email',
          pluginName: 'AltText AI',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid email format');
    });
  });

  describe('POST /email/license-activated', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/email/license-activated')
        .send({
          email: 'test@example.com',
          planName: 'Pro',
        });

      expect(res.status).toBe(401);
    });

    test('sends license activated email with valid data', async () => {
      const token = createTestToken({ id: 1, email: 'test@example.com', plan: 'pro' });

      const res = await request(app)
        .post('/email/license-activated')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          planName: 'Pro',
          siteUrl: 'https://example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendLicenseActivated).toHaveBeenCalledWith({
        email: 'test@example.com',
        planName: 'Pro',
        siteUrl: 'https://example.com',
      });
    });

    test('returns 400 when planName is missing', async () => {
      const token = createTestToken({ id: 1, email: 'test@example.com', plan: 'pro' });

      const res = await request(app)
        .post('/email/license-activated')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('POST /email/low-credit-warning', () => {
    test('sends low credit warning with valid data', async () => {
      const res = await request(app)
        .post('/email/low-credit-warning')
        .send({
          email: 'test@example.com',
          remainingCredits: 10,
          pluginName: 'AltText AI',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendLowCreditWarning).toHaveBeenCalledWith({
        email: 'test@example.com',
        remainingCredits: 10,
        pluginName: 'AltText AI',
      });
    });

    test('returns 400 when remainingCredits is missing', async () => {
      const res = await request(app)
        .post('/email/low-credit-warning')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Remaining credits');
    });
  });

  describe('POST /email/receipt', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/email/receipt')
        .send({
          email: 'test@example.com',
          amount: 29.99,
          planName: 'Pro',
        });

      expect(res.status).toBe(401);
    });

    test('sends receipt email with valid data', async () => {
      const token = createTestToken({ id: 1, email: 'test@example.com', plan: 'pro' });

      const res = await request(app)
        .post('/email/receipt')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          amount: 29.99,
          planName: 'Pro',
          invoiceUrl: 'https://example.com/invoice',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendReceipt).toHaveBeenCalledWith({
        email: 'test@example.com',
        amount: 29.99,
        planName: 'Pro',
        invoiceUrl: 'https://example.com/invoice',
      });
    });

    test('returns 400 when amount is invalid', async () => {
      const token = createTestToken({ id: 1, email: 'test@example.com', plan: 'pro' });

      const res = await request(app)
        .post('/email/receipt')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          amount: -10,
          planName: 'Pro',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(res.body.error).toContain('positive');
    });
  });
});
