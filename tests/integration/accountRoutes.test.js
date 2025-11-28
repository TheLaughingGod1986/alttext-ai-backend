/**
 * Integration tests for account routes
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');

// Mock services at top level for Jest hoisting
jest.mock('../../src/services/userAccountService', () => ({
  getUserInstallations: jest.fn(),
  getUserPlugins: jest.fn(),
  getUserSites: jest.fn(),
  getFullAccount: jest.fn(),
}));

jest.mock('../../src/services/accountService', () => ({
  getAccountSummary: jest.fn(),
}));

describe('Account Routes', () => {
  let app;
  let mockUserAccountService;
  let mockAccountService;

  beforeAll(() => {
    app = createTestServer();
    mockUserAccountService = require('../../src/services/userAccountService');
    mockAccountService = require('../../src/services/accountService');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default to success
    mockUserAccountService.getUserInstallations.mockResolvedValue({
      success: true,
      installations: [{ email: 'test@example.com', plugin_slug: 'alttext-ai' }],
    });
    mockUserAccountService.getFullAccount.mockResolvedValue({
      success: true,
      email: 'test@example.com',
      installations: [],
      plugins: [],
      sites: [],
    });
  });

  describe('POST /account/overview', () => {
    test('returns full account data with valid email', async () => {
      const res = await request(app)
        .post('/account/overview')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('email');
      expect(res.body.data).toHaveProperty('installations');
      expect(res.body.data).toHaveProperty('plugins');
      expect(res.body.data).toHaveProperty('sites');
      expect(mockUserAccountService.getFullAccount).toHaveBeenCalledWith('test@example.com');
    });

    test('returns 400 for invalid email', async () => {
      const res = await request(app)
        .post('/account/overview')
        .send({
          email: 'invalid-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid email');
    });

    test('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/account/overview')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('returns 500 when service fails', async () => {
      mockUserAccountService.getFullAccount.mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      });

      const res = await request(app)
        .post('/account/overview')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Database connection failed');
    });

    test('response shape matches spec', async () => {
      const res = await request(app)
        .post('/account/overview')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('email');
      expect(res.body.data).toHaveProperty('installations');
      expect(res.body.data).toHaveProperty('plugins');
      expect(res.body.data).toHaveProperty('sites');
      expect(Array.isArray(res.body.data.installations)).toBe(true);
      expect(Array.isArray(res.body.data.plugins)).toBe(true);
      expect(Array.isArray(res.body.data.sites)).toBe(true);
    });
  });

  describe('POST /account/installations', () => {
    test('returns installations with valid email', async () => {
      const res = await request(app)
        .post('/account/installations')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('installations');
      expect(Array.isArray(res.body.installations)).toBe(true);
      expect(mockUserAccountService.getUserInstallations).toHaveBeenCalledWith('test@example.com');
    });

    test('returns 400 for invalid email', async () => {
      const res = await request(app)
        .post('/account/installations')
        .send({
          email: 'invalid-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid email');
    });

    test('returns 500 when service fails', async () => {
      mockUserAccountService.getUserInstallations.mockResolvedValue({
        success: false,
        error: 'Database query failed',
      });

      const res = await request(app)
        .post('/account/installations')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Database query failed');
    });

    test('response shape matches spec', async () => {
      const res = await request(app)
        .post('/account/installations')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ok', true);
      expect(res.body).toHaveProperty('installations');
      expect(Array.isArray(res.body.installations)).toBe(true);
    });
  });

  describe('POST /account/summary', () => {
    beforeEach(() => {
      mockAccountService.getAccountSummary.mockResolvedValue({
        ok: true,
        data: {
          email: 'test@example.com',
          installations: [
            { id: '1', plugin_slug: 'alttext-ai', site_url: 'https://example.com' },
          ],
          subscriptions: [
            { id: 'sub1', plugin_slug: 'alttext-ai', plan: 'pro', status: 'active' },
          ],
          usage: {
            'alttext-ai': {
              monthlyImages: 450,
              dailyImages: 15,
              totalImages: 2000,
              quota: 1000,
              remaining: 550,
            },
          },
          plans: {
            'alttext-ai': {
              currentPlan: 'pro',
              monthlyImages: 1000,
              tokens: 1000,
            },
          },
        },
      });
    });

    test('returns 200 with valid email', async () => {
      const res = await request(app)
        .post('/account/summary')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('email');
      expect(res.body.data).toHaveProperty('installations');
      expect(res.body.data).toHaveProperty('subscriptions');
      expect(res.body.data).toHaveProperty('usage');
      expect(res.body.data).toHaveProperty('plans');
      expect(mockAccountService.getAccountSummary).toHaveBeenCalledWith('test@example.com');
    });

    test('returns 400 for invalid email', async () => {
      const res = await request(app)
        .post('/account/summary')
        .send({
          email: 'invalid-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Invalid email');
    });

    test('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/account/summary')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    test('returns correct data structure', async () => {
      const res = await request(app)
        .post('/account/summary')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.email).toBe('test@example.com');
      expect(Array.isArray(res.body.data.installations)).toBe(true);
      expect(Array.isArray(res.body.data.subscriptions)).toBe(true);
      expect(typeof res.body.data.usage).toBe('object');
      expect(typeof res.body.data.plans).toBe('object');
    });

    test('handles missing data gracefully', async () => {
      mockAccountService.getAccountSummary.mockResolvedValue({
        ok: true,
        data: {
          email: 'test@example.com',
          installations: [],
          subscriptions: [],
          usage: {},
          plans: {},
        },
      });

      const res = await request(app)
        .post('/account/summary')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.installations).toEqual([]);
      expect(res.body.data.subscriptions).toEqual([]);
    });

    test('returns 500 when service fails', async () => {
      mockAccountService.getAccountSummary.mockResolvedValue({
        ok: false,
        error: 'Failed to fetch account summary',
      });

      const res = await request(app)
        .post('/account/summary')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Failed to fetch account summary');
    });
  });
});

