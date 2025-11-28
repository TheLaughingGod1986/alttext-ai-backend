/**
 * Integration tests for dashboard routes
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const { createTestToken } = require('../helpers/testHelpers');

// Mock services at top level for Jest hoisting
jest.mock('../../src/services/identityService', () => ({
  getIdentityDashboard: jest.fn(),
}));

jest.mock('../../db/supabase-client', () => {
  const mockSupabase = {
    from: jest.fn(() => mockSupabase),
    select: jest.fn(() => mockSupabase),
    eq: jest.fn(() => mockSupabase),
    single: jest.fn(() => mockSupabase),
    order: jest.fn(() => mockSupabase),
  };
  return {
    supabase: mockSupabase,
  };
});

describe('Dashboard Routes', () => {
  let app;
  let mockIdentityService;
  let testToken;
  const testEmail = 'test@example.com';
  const testUserId = 'test-user-id';

  beforeAll(() => {
    app = createTestServer();
    mockIdentityService = require('../../src/services/identityService');
    testToken = createTestToken({ id: testUserId, email: testEmail, plugin: 'alttext-ai' });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /me', () => {
    it('returns email and plugin from JWT payload', async () => {
      const res = await request(app)
        .get('/me')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.plugin).toBe('alttext-ai');
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .get('/me');

      expect(res.status).toBe(401);
      expect(res.body.error || res.body.code).toBeDefined();
    });
  });

  describe('GET /dashboard', () => {
    beforeEach(() => {
      mockIdentityService.getIdentityDashboard.mockResolvedValue({
        installations: [
          {
            id: '1',
            email: testEmail,
            plugin_slug: 'alttext-ai',
            site_url: 'https://example.com',
            last_seen_at: '2024-01-10T11:00:00.000Z',
          },
        ],
        subscription: {
          id: 'sub1',
          user_email: testEmail,
          plugin_slug: 'alttext-ai',
          plan: 'pro',
          status: 'active',
        },
        usage: {
          monthlyImages: 450,
          dailyImages: 15,
          totalImages: 2000,
        },
      });
    });

    it('returns dashboard data with valid token', async () => {
      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.installations).toBeDefined();
      expect(Array.isArray(res.body.installations)).toBe(true);
      expect(res.body.subscription).toBeDefined();
      expect(res.body.usage).toBeDefined();
      expect(mockIdentityService.getIdentityDashboard).toHaveBeenCalledWith(testEmail);
    });

    it('returns 401 without authentication', async () => {
      const res = await request(app)
        .get('/dashboard');

      expect(res.status).toBe(401);
      expect(res.body.error || res.body.code).toBeDefined();
    });

    it('handles empty states correctly', async () => {
      mockIdentityService.getIdentityDashboard.mockResolvedValue({
        installations: [],
        subscription: null,
        usage: { monthlyImages: 0, dailyImages: 0, totalImages: 0 },
      });

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.installations).toEqual([]);
      expect(res.body.subscription).toBeNull();
      expect(res.body.usage).toEqual({ monthlyImages: 0, dailyImages: 0, totalImages: 0 });
    });

    it('returns 400 when email is missing from token', async () => {
      const tokenWithoutEmail = createTestToken({ id: testUserId });
      // Mock getIdentityDashboard to not be called
      mockIdentityService.getIdentityDashboard.mockClear();

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${tokenWithoutEmail}`);

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('email');
      expect(mockIdentityService.getIdentityDashboard).not.toHaveBeenCalled();
    });

    it('returns 500 when service fails', async () => {
      mockIdentityService.getIdentityDashboard.mockRejectedValue(
        new Error('Service error')
      );

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Failed to load dashboard');
    });

    it('response shape matches spec', async () => {
      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('installations');
      expect(res.body).toHaveProperty('subscription');
      expect(res.body).toHaveProperty('usage');
      expect(Array.isArray(res.body.installations)).toBe(true);
    });

    it('handles subscription with null status (free plan)', async () => {
      mockIdentityService.getIdentityDashboard.mockResolvedValue({
        installations: [],
        subscription: null,
        usage: { monthlyImages: 0, dailyImages: 0, totalImages: 0 },
      });

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.subscription).toBeNull();
    });

    it('handles subscription with past_due status', async () => {
      mockIdentityService.getIdentityDashboard.mockResolvedValue({
        installations: [],
        subscription: {
          id: 'sub1',
          user_email: testEmail,
          plugin_slug: 'alttext-ai',
          plan: 'pro',
          status: 'past_due',
        },
        usage: { monthlyImages: 100, dailyImages: 5, totalImages: 500 },
      });

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.subscription).toBeDefined();
      expect(res.body.subscription.status).toBe('past_due');
    });

    it('handles subscription with canceled status', async () => {
      mockIdentityService.getIdentityDashboard.mockResolvedValue({
        installations: [],
        subscription: {
          id: 'sub1',
          user_email: testEmail,
          plugin_slug: 'alttext-ai',
          plan: 'pro',
          status: 'canceled',
        },
        usage: { monthlyImages: 50, dailyImages: 2, totalImages: 200 },
      });

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.subscription).toBeDefined();
      expect(res.body.subscription.status).toBe('canceled');
    });

    it('handles subscription with trialing status', async () => {
      mockIdentityService.getIdentityDashboard.mockResolvedValue({
        installations: [],
        subscription: {
          id: 'sub1',
          user_email: testEmail,
          plugin_slug: 'alttext-ai',
          plan: 'pro',
          status: 'trialing',
        },
        usage: { monthlyImages: 200, dailyImages: 10, totalImages: 1000 },
      });

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.subscription).toBeDefined();
      expect(res.body.subscription.status).toBe('trialing');
    });

    it('handles subscription with agency plan', async () => {
      mockIdentityService.getIdentityDashboard.mockResolvedValue({
        installations: [],
        subscription: {
          id: 'sub1',
          user_email: testEmail,
          plugin_slug: 'alttext-ai',
          plan: 'agency',
          status: 'active',
        },
        usage: { monthlyImages: 5000, dailyImages: 200, totalImages: 50000 },
      });

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.subscription).toBeDefined();
      expect(res.body.subscription.plan).toBe('agency');
    });
  });
});

