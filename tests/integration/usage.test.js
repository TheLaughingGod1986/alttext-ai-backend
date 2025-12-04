const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const supabaseMock = require('../mocks/supabase.mock');
const { generateToken } = require('../../auth/jwt');

let server;
const token = generateToken({ id: 20, email: 'usage@example.com', plan: 'pro' });
const TEST_SITE_HASH = 'test-site-hash';

// Mock siteService
jest.mock('../../src/services/siteService', () => ({
  getOrCreateSite: jest.fn(),
  getSiteUsage: jest.fn(),
  getSiteLicense: jest.fn(),
  getNextResetDate: jest.fn(() => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  }),
  PLAN_LIMITS: {
    'alttext-ai': {
      free: 50,
      pro: 1000,
      agency: 10000
    }
  }
}));

const siteService = require('../../src/services/siteService');

describe('Usage routes', () => {
  beforeAll(() => {
    const { createTestServer } = require('../helpers/createTestServer');
    server = createTestServer();
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });
  beforeEach(() => {
    supabaseMock.__reset();
    jest.clearAllMocks();

    // Default mocks for siteService
    siteService.getOrCreateSite.mockResolvedValue({
      id: 'site_123',
      site_hash: TEST_SITE_HASH,
      plan: 'free',
      license_key: null,
    });

    const nextResetDate = siteService.getNextResetDate();
    siteService.getSiteUsage.mockResolvedValue({
      used: 0,
      remaining: 50,
      plan: 'free',
      limit: 50,
      resetDate: nextResetDate,
    });

    siteService.getSiteLicense.mockResolvedValue(null);
  });

  test('returns usage summary', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 20, plan: 'pro', service: 'alttext-ai' },
      error: null
    });

    siteService.getSiteUsage.mockResolvedValue({
      used: 5,
      remaining: 995,
      plan: 'pro',
      limit: 1000,
      resetDate: siteService.getNextResetDate(),
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', TEST_SITE_HASH);

    expect(res.status).toBe(200);
    expect(res.body.data.usage.used).toBe(5);
    expect(res.body.data.usage.limit).toBe(1000);
    expect(res.body.data.usage.remaining).toBe(995);
  });

  test('usage endpoint handles missing user', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'not found' }
    });

    // When user is not found, route continues with site-based quota
    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', TEST_SITE_HASH);

    expect(res.status).toBe(200);
    expect(res.body.data.usage).toBeDefined();
  });

  test('returns usage history', async () => {
    supabaseMock.__queueResponse('usage_logs', 'select', {
      data: [{ id: 1, image_id: 'img', endpoint: 'generate', created_at: new Date().toISOString() }],
      error: null
    });
    supabaseMock.__queueResponse('usage_logs', 'select', {
      count: 1,
      error: null
    });

    const res = await request(server)
      .get('/usage/history')
      .set('X-Site-Hash', TEST_SITE_HASH)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.usageLogs.length).toBe(1);
  });

  test('usage endpoint handles Supabase count error', async () => {
    // Mock siteService.getSiteUsage to throw an error
    siteService.getSiteUsage.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', TEST_SITE_HASH);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('USAGE_ERROR');
  });

  test('usage history handles Supabase query error', async () => {
    supabaseMock.__queueResponse('usage_logs', 'select', {
      data: null,
      error: { message: 'Query failed', code: 'PGRST116' }
    });

    const res = await request(server)
      .get('/usage/history')
      .set('X-Site-Hash', TEST_SITE_HASH)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('HISTORY_ERROR');
  });

  test('usage endpoint shows zero remaining when quota exhausted', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 20, plan: 'free', service: 'alttext-ai' },
      error: null
    });

    siteService.getSiteUsage.mockResolvedValue({
      used: 50,
      remaining: 0,
      plan: 'free',
      limit: 50,
      resetDate: siteService.getNextResetDate(),
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', TEST_SITE_HASH);

    expect(res.status).toBe(200);
    expect(res.body.data.usage.remaining).toBe(0);
    expect(res.body.data.usage.used).toBe(50);
  });

  test('usage endpoint handles missing credits record', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 20, plan: 'pro', service: 'alttext-ai' },
      error: null
    });

    siteService.getSiteUsage.mockResolvedValue({
      used: 10,
      remaining: 990,
      plan: 'pro',
      limit: 1000,
      resetDate: siteService.getNextResetDate(),
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', TEST_SITE_HASH);

    expect(res.status).toBe(200);
    expect(res.body.data.usage.limit).toBe(1000);
    expect(res.body.data.usage.remaining).toBe(990);
  });

  test('usage history handles pagination parameters', async () => {
    supabaseMock.__queueResponse('usage_logs', 'select', {
      data: [
        { id: 1, image_id: 'img1', endpoint: 'generate', created_at: new Date().toISOString() },
        { id: 2, image_id: 'img2', endpoint: 'generate', created_at: new Date().toISOString() }
      ],
      error: null
    });
    supabaseMock.__queueResponse('usage_logs', 'select', {
      count: 25,
      error: null
    });

    const res = await request(server)
      .get('/usage/history?page=2&limit=10')
      .set('X-Site-Hash', TEST_SITE_HASH)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(10);
    expect(res.body.pagination.total).toBe(25);
    expect(res.body.pagination.pages).toBe(3);
  });

  test('usage history handles totalCountResult error', async () => {
    supabaseMock.__queueResponse('usage_logs', 'select', {
      data: [{ id: 1, image_id: 'img', endpoint: 'generate', created_at: new Date().toISOString() }],
      error: null
    });
    supabaseMock.__queueResponse('usage_logs', 'select', {
      count: null,
      error: new Error('Count query failed')
    });

    const res = await request(server)
      .get('/usage/history')
      .set('X-Site-Hash', TEST_SITE_HASH)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('HISTORY_ERROR');
  });

  test('usage endpoint handles userError case', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'Database error', code: 'PGRST500' }
    });

    // When user query fails, route continues with site-based quota
    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', TEST_SITE_HASH);

    expect(res.status).toBe(200);
    expect(res.body.data.usage).toBeDefined();
  });

  test('usage endpoint handles user null case', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: null // Query succeeds but returns no user
    });

    // When user is null, route continues with site-based quota
    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', TEST_SITE_HASH);

    expect(res.status).toBe(200);
    expect(res.body.data.usage).toBeDefined();
  });
});

