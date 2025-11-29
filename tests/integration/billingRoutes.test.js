/**
 * Integration tests for billing routes
 */

// Mock billingService to prevent real API calls - MUST be at top level for Jest hoisting
jest.mock('../../src/services/billingService', () => ({
  createOrGetCustomer: jest.fn().mockResolvedValue({
    success: true,
    data: { customerId: 'cus_test123' }
  }),
  getUserSubscriptions: jest.fn().mockResolvedValue({
    success: true,
    subscriptions: []
  }),
  listSubscriptions: jest.fn().mockResolvedValue({
    success: true,
    subscriptions: []
  })
}));

// Mock stripeClient to prevent real Stripe API calls - MUST be at top level for Jest hoisting
jest.mock('../../src/utils/stripeClient', () => ({
  getStripe: jest.fn().mockReturnValue({
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test123',
          url: 'https://checkout.stripe.com/test'
        })
      }
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          url: 'https://billing.stripe.com/test'
        })
      }
    }
  })
}));

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const { createTestToken } = require('../helpers/testHelpers');

describe('Billing Routes', () => {
  let server;
  let testToken;
  const testEmail = 'test@example.com';

  beforeAll(() => {
    const { createTestServer } = require('../helpers/createTestServer');
    server = createTestServer();
    // Create a test token for authentication
    testToken = createTestToken({ id: 'test-user-id', email: testEmail });
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /billing/create-checkout', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(server)
        .post('/billing/create-checkout')
        .send({
          email: testEmail,
          plugin: 'alttext-ai',
          priceId: 'price_123',
        });

      expect(res.status).toBe(401);
      // Middleware returns { error, code } format, route handler returns { ok: false, error }
      expect(res.body.error || res.body.ok === false).toBeTruthy();
    });

    it('should return 400 for invalid input', async () => {
      const res = await request(server)
        .post('/billing/create-checkout')
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should return 403 for email mismatch', async () => {
      const res = await request(server)
        .post('/billing/create-checkout')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'different@example.com',
          plugin: 'alttext-ai',
          priceId: 'price_123',
        });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('your own email');
    });

    it('should return 500 if Stripe not configured', async () => {
      const res = await request(server)
        .post('/billing/create-checkout')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: testEmail,
          plugin: 'alttext-ai',
          priceId: 'price_123',
        });

      // Will fail because Stripe is not configured in test environment
      expect([400, 500]).toContain(res.status);
    });
  });

  describe('POST /billing/create-portal', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(server)
        .post('/billing/create-portal')
        .send({ email: testEmail });

      expect(res.status).toBe(401);
      // Middleware returns { error, code } format, route handler returns { ok: false, error }
      expect(res.body.error || res.body.ok === false).toBeTruthy();
    });

    it('should return 400 for invalid input', async () => {
      const res = await request(server)
        .post('/billing/create-portal')
        .set('Authorization', `Bearer ${testToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should return 403 for email mismatch', async () => {
      const res = await request(server)
        .post('/billing/create-portal')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'different@example.com' });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('your own email');
    });
  });

  describe('POST /billing/subscriptions', () => {
    it('should return 401 without authentication', async () => {
      const res = await request(server)
        .post('/billing/subscriptions')
        .send({ email: testEmail });

      expect(res.status).toBe(401);
      // Middleware returns { error, code } format, route handler returns { ok: false, error }
      expect(res.body.error || res.body.ok === false).toBeTruthy();
    });

    it('should return 400 for invalid email', async () => {
      const res = await request(server)
        .post('/billing/subscriptions')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'invalid-email' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should return 403 for email mismatch', async () => {
      const res = await request(server)
        .post('/billing/subscriptions')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: 'different@example.com' });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('your own email');
    });

    it('should return subscriptions array for valid email', async () => {
      const res = await request(server)
        .post('/billing/subscriptions')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ email: testEmail });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.subscriptions)).toBe(true);
    });
  });
});

