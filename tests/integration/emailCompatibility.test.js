/**
 * Integration tests for backward compatibility email routes
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');

// Mock emailService at top level for Jest hoisting
jest.mock('../../src/services/emailService', () => ({
  sendPluginSignup: jest.fn(),
  sendWaitlistWelcome: jest.fn(),
  sendDashboardWelcome: jest.fn(),
}));

describe('Backward Compatibility Email Routes', () => {
  let app;
  let mockEmailService;

  beforeAll(() => {
    app = createTestServer();
    mockEmailService = require('../../src/services/emailService');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default to success
    mockEmailService.sendPluginSignup.mockResolvedValue({ success: true, emailId: 'email_123' });
    mockEmailService.sendWaitlistWelcome.mockResolvedValue({ success: true, emailId: 'email_123' });
    mockEmailService.sendDashboardWelcome.mockResolvedValue({ success: true, emailId: 'email_123' });
  });

  describe('POST /plugin/register', () => {
    test('sends plugin signup email with valid data', async () => {
      const res = await request(app)
        .post('/plugin/register')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
          site: 'https://example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendPluginSignup).toHaveBeenCalledWith({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
      });
    });

    test('returns deduplication response when email is deduped', async () => {
      mockEmailService.sendPluginSignup.mockResolvedValue({ success: true, deduped: true });
      
      const res = await request(app)
        .post('/plugin/register')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deduped).toBe(true);
    });

    test('returns 400 when validation fails', async () => {
      const res = await request(app)
        .post('/plugin/register')
        .send({
          email: 'invalid-email',
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid email format');
    });

    test('returns 500 when email service fails', async () => {
      mockEmailService.sendPluginSignup.mockResolvedValue({
        success: false,
        error: 'Failed to send email',
      });

      const res = await request(app)
        .post('/plugin/register')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
    });

    test('handles errors gracefully without breaking endpoint', async () => {
      mockEmailService.sendPluginSignup.mockRejectedValue(new Error('Unexpected error'));

      const res = await request(app)
        .post('/plugin/register')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  describe('POST /wp-signup', () => {
    test('sends plugin signup email with valid data', async () => {
      const res = await request(app)
        .post('/wp-signup')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
          site: 'https://example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendPluginSignup).toHaveBeenCalledWith({
        email: 'test@example.com',
        pluginName: 'AltText AI',
        siteUrl: 'https://example.com',
      });
    });

    test('returns deduplication response when email is deduped', async () => {
      mockEmailService.sendPluginSignup.mockResolvedValue({ success: true, deduped: true });
      
      const res = await request(app)
        .post('/wp-signup')
        .send({
          email: 'test@example.com',
          plugin: 'AltText AI',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deduped).toBe(true);
    });

    test('returns 400 when plugin is missing', async () => {
      const res = await request(app)
        .post('/wp-signup')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('POST /legacy-waitlist', () => {
    test('sends waitlist welcome email with valid data', async () => {
      const res = await request(app)
        .post('/legacy-waitlist')
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

    test('returns deduplication response when email is deduped', async () => {
      mockEmailService.sendWaitlistWelcome.mockResolvedValue({ success: true, deduped: true });
      
      const res = await request(app)
        .post('/legacy-waitlist')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deduped).toBe(true);
    });

    test('returns 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/legacy-waitlist')
        .send({
          email: 'invalid-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('POST /dashboard/email', () => {
    test('sends dashboard welcome email with valid data', async () => {
      const res = await request(app)
        .post('/dashboard/email')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockEmailService.sendDashboardWelcome).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
    });

    test('returns deduplication response when email is deduped', async () => {
      mockEmailService.sendDashboardWelcome.mockResolvedValue({ success: true, deduped: true });
      
      const res = await request(app)
        .post('/dashboard/email')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.deduped).toBe(true);
    });

    test('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/dashboard/email')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('returns 400 when email format is invalid', async () => {
      const res = await request(app)
        .post('/dashboard/email')
        .send({
          email: 'invalid-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid email format');
    });
  });
});

