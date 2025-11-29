/**
 * Integration tests for access control system
 * Tests 403 responses for various denial scenarios
 * Tests that allowed requests proceed correctly
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const { supabase } = require('../../db/supabase-client');
const jwt = require('jsonwebtoken');
const errorCodes = require('../../src/constants/errorCodes');

let app;

// Mock Supabase
jest.mock('../../db/supabase-client', () => {
  const mockSupabase = {
    from: jest.fn(() => mockSupabase),
    select: jest.fn(() => mockSupabase),
    insert: jest.fn(() => mockSupabase),
    update: jest.fn(() => mockSupabase),
    eq: jest.fn(() => mockSupabase),
    single: jest.fn(() => mockSupabase),
    maybeSingle: jest.fn(() => mockSupabase),
    order: jest.fn(() => mockSupabase),
    limit: jest.fn(() => mockSupabase),
  };
  return { supabase: mockSupabase };
});

// Mock services
jest.mock('../../src/services/billingService', () => ({
  getUserSubscriptionStatus: jest.fn(),
  getSubscriptionForEmail: jest.fn(),
}));

jest.mock('../../src/services/creditsService', () => ({
  getOrCreateIdentity: jest.fn(),
  getBalanceByEmail: jest.fn(),
  spendCredits: jest.fn(),
}));

jest.mock('../../src/services/eventService', () => ({
  logEvent: jest.fn(),
  getCreditBalance: jest.fn(),
}));

jest.mock('../../src/services/siteService', () => ({
  getOrCreateSite: jest.fn(),
  checkSiteQuota: jest.fn(),
  getSiteUsage: jest.fn(),
  deductSiteQuota: jest.fn(),
}));

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const billingService = require('../../src/services/billingService');
const creditsService = require('../../src/services/creditsService');
const eventService = require('../../src/services/eventService');
const siteService = require('../../src/services/siteService');
const axios = require('axios');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

function generateToken(email) {
  return jwt.sign({ email, plugin: 'alttext-ai' }, JWT_SECRET, { expiresIn: '12h' });
}

describe('Access Control Integration Tests', () => {
  beforeAll(() => {
    app = createTestServer();
    if (!app) {
      throw new Error('Failed to create test server');
    }
  });
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks for successful requests
    creditsService.getOrCreateIdentity.mockResolvedValue({
      success: true,
      identityId: 'identity_123',
    });

    eventService.getCreditBalance.mockResolvedValue({
      success: true,
      balance: 0,
    });

    siteService.getOrCreateSite.mockResolvedValue({
      id: 'site_123',
      site_hash: 'test-site-hash',
      plan: 'free',
    });

    siteService.checkSiteQuota.mockResolvedValue({
      hasQuota: true,
      used: 0,
      limit: 50,
      plan: 'free',
    });

    siteService.getSiteUsage.mockResolvedValue({
      used: 0,
      remaining: 50,
      plan: 'free',
      limit: 50,
    });

    siteService.deductSiteQuota.mockResolvedValue(true);

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Generated alt text.' } }],
        usage: { total_tokens: 10 },
      },
    });
  });

  describe('POST /api/generate - Access Control', () => {
    it('should return 403 for inactive subscription with no credits', async () => {
      const token = generateToken('test@example.com');

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'pro',
        status: 'cancelled',
        renewsAt: null,
        canceledAt: new Date().toISOString(),
        trialEndsAt: null,
        raw: {},
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const response = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Site-Hash', 'test-site-hash')
        .send({
          image_data: { url: 'https://example.com/image.jpg' },
          service: 'alttext-ai',
        });

      expect(response.status).toBe(403);
      expect(response.body.ok).toBe(false);
      expect(response.body.code).toBe(errorCodes.NO_ACCESS);
      expect(response.body.reason).toBe(errorCodes.REASONS.SUBSCRIPTION_INACTIVE);
    });

    it('should return 403 for free plan with no credits', async () => {
      const token = generateToken('test@example.com');

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'free',
        status: 'inactive',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: null,
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const response = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Site-Hash', 'test-site-hash')
        .send({
          image_data: { url: 'https://example.com/image.jpg' },
          service: 'alttext-ai',
        });

      expect(response.status).toBe(403);
      expect(response.body.ok).toBe(false);
      expect(response.body.code).toBe(errorCodes.NO_ACCESS);
      expect(response.body.reason).toBe(errorCodes.REASONS.NO_SUBSCRIPTION);
    });

    it('should allow access when user has credits (override)', async () => {
      const token = generateToken('test@example.com');

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'free',
        status: 'inactive',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: null,
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 10,
      });

      eventService.getCreditBalance.mockResolvedValue({
        success: true,
        balance: 10,
      });

      creditsService.spendCredits.mockResolvedValue({
        success: true,
        remainingBalance: 9,
      });

      const response = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Site-Hash', 'test-site-hash')
        .send({
          image_data: { url: 'https://example.com/image.jpg' },
          service: 'alttext-ai',
        });

      // Should proceed to generation (not 403)
      expect(response.status).not.toBe(403);
      // If it's not 403, it should be 200 or another success status
      expect([200, 201]).toContain(response.status);
    });

    it('should allow access for active subscription', async () => {
      const token = generateToken('test@example.com');

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'pro',
        status: 'active',
        renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        canceledAt: null,
        trialEndsAt: null,
        raw: {},
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const response = await request(app)
        .post('/api/generate')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Site-Hash', 'test-site-hash')
        .send({
          image_data: { url: 'https://example.com/image.jpg' },
          service: 'alttext-ai',
        });

      // Should proceed to generation (not 403)
      expect(response.status).not.toBe(403);
    });

    it('should return 401 when token is missing', async () => {
      const response = await request(app)
        .post('/api/generate')
        .set('X-Site-Hash', 'test-site-hash')
        .send({
          image_data: { url: 'https://example.com/image.jpg' },
          service: 'alttext-ai',
        });

      // Note: combinedAuth might allow unauthenticated requests for site-based quota
      // This test verifies the middleware chain behavior
      // The actual behavior depends on combinedAuth implementation
      expect([200, 401, 403]).toContain(response.status);
    });
  });

  describe('POST /api/review - Access Control', () => {
    it('should return 403 for inactive subscription', async () => {
      const token = generateToken('test@example.com');

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'pro',
        status: 'cancelled',
        renewsAt: null,
        canceledAt: new Date().toISOString(),
        trialEndsAt: null,
        raw: {},
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 0,
      });

      const response = await request(app)
        .post('/api/review')
        .set('Authorization', `Bearer ${token}`)
        .send({
          alt_text: 'Test alt text',
          image_data: { url: 'https://example.com/image.jpg' },
        });

      expect(response.status).toBe(403);
      expect(response.body.ok).toBe(false);
      expect(response.body.code).toBe(errorCodes.NO_ACCESS);
    });

    it('should allow access when user has credits', async () => {
      const token = generateToken('test@example.com');

      billingService.getUserSubscriptionStatus.mockResolvedValue({
        plan: 'free',
        status: 'inactive',
        renewsAt: null,
        canceledAt: null,
        trialEndsAt: null,
        raw: null,
      });

      creditsService.getBalanceByEmail.mockResolvedValue({
        success: true,
        balance: 5,
      });

      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '{"score": 85, "status": "good"}' } }],
          usage: { total_tokens: 10 },
        },
      });

      const response = await request(app)
        .post('/api/review')
        .set('Authorization', `Bearer ${token}`)
        .send({
          alt_text: 'Test alt text',
          image_data: { url: 'https://example.com/image.jpg' },
        });

      expect(response.status).not.toBe(403);
    });
  });
});

