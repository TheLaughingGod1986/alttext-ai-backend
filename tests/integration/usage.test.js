const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const supabaseMock = require('../mocks/supabase.mock');
const { generateToken } = require('../../auth/jwt');

let server;
const token = generateToken({ id: 20, email: 'usage@example.com', plan: 'pro' });

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
  });

  test('returns usage summary', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 20, plan: 'pro', created_at: new Date().toISOString() },
      error: null
    });
    supabaseMock.__queueResponse('usage_logs', 'select', {
      count: 5,
      error: null
    });
    supabaseMock.__queueResponse('credits', 'select', {
      data: { monthly_limit: 100, used_this_month: 10 },
      error: null
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.usage.used).toBe(5);
  });

  test('usage endpoint handles missing user', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'not found' }
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
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
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.usageLogs.length).toBe(1);
  });

  test('usage endpoint handles Supabase count error', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 20, plan: 'pro', created_at: new Date().toISOString() },
      error: null
    });
    supabaseMock.__queueResponse('usage_logs', 'select', {
      count: null,
      error: { message: 'DB connection failed', code: 'PGRST500' }
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);

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
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('HISTORY_ERROR');
  });

  test('usage endpoint shows zero remaining when quota exhausted', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 20, plan: 'free', created_at: new Date().toISOString() },
      error: null
    });
    supabaseMock.__queueResponse('usage_logs', 'select', {
      count: 50, // Free plan limit reached
      error: null
    });
    supabaseMock.__queueResponse('credits', 'select', {
      data: { monthly_limit: 50, used_this_month: 50 },
      error: null
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.usage.remaining).toBe(0);
    expect(res.body.usage.used).toBe(50);
  });

  test('usage endpoint handles missing credits record', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 20, plan: 'pro', created_at: new Date().toISOString() },
      error: null
    });
    supabaseMock.__queueResponse('usage_logs', 'select', {
      count: 10,
      error: null
    });
    supabaseMock.__queueResponse('credits', 'select', {
      data: null, // No credits record
      error: null
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // When credits record is missing, monthlyLimit defaults to plan limit (1000) and usedThisMonth defaults to 0
    expect(res.body.usage.credits).toBe(1000); // 1000 - 0
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
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('HISTORY_ERROR');
  });

  test('usage endpoint handles userError case', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'Database error', code: 'PGRST500' }
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('usage endpoint handles user null case', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: null // Query succeeds but returns no user
    });

    const res = await request(server)
      .get('/usage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });
});

