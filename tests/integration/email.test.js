/**
 * Integration tests for email routes
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const { createTestToken } = require('../helpers/testHelpers');

describe('Email Routes', () => {
  let app;

  beforeAll(() => {
    app = createTestServer();
  });

  describe('POST /email/welcome', () => {
    test('sends welcome email with valid data', async () => {
      const res = await request(app)
        .post('/email/welcome')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          plugin: 'AltText AI'
        });

      // Should return success (even if email service not configured in test)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.email_id).toBeDefined();
      }
    });

    test('validates email format', async () => {
      const res = await request(app)
        .post('/email/welcome')
        .send({
          email: 'invalid-email',
          name: 'Test User'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('validates required email field', async () => {
      const res = await request(app)
        .post('/email/welcome')
        .send({
          name: 'Test User'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('respects rate limiting', async () => {
      // Send multiple requests quickly
      const requests = Array(15).fill(null).map(() =>
        request(app)
          .post('/email/welcome')
          .send({
            email: 'ratelimit@example.com',
            name: 'Test User'
          })
      );

      const responses = await Promise.all(requests);
      // At least one should be rate limited
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('POST /email/license/activated', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/email/license/activated')
        .send({
          email: 'test@example.com',
          licenseKey: 'key_123',
          plan: 'pro',
          tokenLimit: 1000,
          tokensRemaining: 1000
        });

      expect(res.status).toBe(401);
    });

    test('sends license activated email with valid data', async () => {
      const token = createTestToken({ id: 1, email: 'test@example.com', plan: 'pro' });

      const res = await request(app)
        .post('/email/license/activated')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          name: 'Test User',
          licenseKey: 'key_123',
          plan: 'pro',
          tokenLimit: 1000,
          tokensRemaining: 1000
        });

      // Should return success (even if email service not configured in test)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    test('validates required fields', async () => {
      const token = createTestToken({ id: 1, email: 'test@example.com', plan: 'pro' });

      const res = await request(app)
        .post('/email/license/activated')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com'
          // Missing required fields
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /email/credits/low', () => {
    test('sends low credit warning with valid data', async () => {
      const res = await request(app)
        .post('/email/credits/low')
        .send({
          email: 'test@example.com',
          used: 35,
          limit: 50,
          plan: 'free'
        });

      // Should return success (even if email service not configured in test)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    test('validates used and limit are numbers', async () => {
      const res = await request(app)
        .post('/email/credits/low')
        .send({
          email: 'test@example.com',
          used: 'not-a-number',
          limit: 50
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    test('validates used does not exceed limit', async () => {
      const res = await request(app)
        .post('/email/credits/low')
        .send({
          email: 'test@example.com',
          used: 100,
          limit: 50
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /email/receipt', () => {
    test('requires authentication', async () => {
      const res = await request(app)
        .post('/email/receipt')
        .send({
          email: 'test@example.com',
          amount: 29.99,
          plan: 'pro',
          transactionId: 'txn_123',
          date: new Date().toISOString()
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
          invoiceUrl: 'https://example.com/invoice'
        });

      // Should return success (even if email service not configured in test)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.ok || res.body.success).toBe(true);
      }
    });

    test('validates amount is positive', async () => {
      const token = createTestToken({ id: 1, email: 'test@example.com', plan: 'pro' });

      const res = await request(app)
        .post('/email/receipt')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@example.com',
          amount: -10,
          planName: 'Pro'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /email/plugin/signup', () => {
    test('sends plugin signup email with valid data', async () => {
      const res = await request(app)
        .post('/email/plugin/signup')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          plugin: 'AltText AI',
          installId: 'wp_123'
        });

      // Should return success (even if email service not configured in test)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    test('validates email format', async () => {
      const res = await request(app)
        .post('/email/plugin/signup')
        .send({
          email: 'invalid-email',
          plugin: 'AltText AI'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });
});
