const express = require('express');
const request = require('supertest');

jest.mock('../../lib/openai', () => ({
  generateAltText: jest.fn().mockResolvedValue({
    altText: 'mock alt',
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    meta: { modelUsed: 'mock', generation_time_ms: 1 }
  })
}));

jest.mock('../../services/quota', () => ({
  enforceQuota: jest.fn().mockResolvedValue({
    plan_type: 'pro',
    credits_used: 0,
    credits_remaining: 1000,
    total_limit: 1000
  }),
  getQuotaStatus: jest.fn().mockResolvedValue({
    plan_type: 'pro',
    credits_used: 0,
    credits_remaining: 1000,
    total_limit: 1000
  })
}));

jest.mock('../../services/usage', () => ({
  recordUsage: jest.fn().mockResolvedValue({ error: null })
}));

const { createAltTextRouter } = require('../../routes/altText');

/**
 * Creates a chainable mock that supports all Supabase query methods.
 */
function createChainableMock(resolveData = null, resolveError = null) {
  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    neq: () => chainable,
    gt: () => chainable,
    gte: () => chainable,
    lt: () => chainable,
    lte: () => chainable,
    like: () => chainable,
    ilike: () => chainable,
    is: () => chainable,
    in: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    insert: () => chainable,
    update: () => chainable,
    upsert: () => chainable,
    single: () => Promise.resolve({ data: resolveData, error: resolveError }),
    maybeSingle: () => Promise.resolve({ data: resolveData, error: resolveError }),
    then: (resolve) => resolve({ data: resolveData ? [resolveData] : [], error: resolveError })
  };
  return chainable;
}

function createSupabaseMock() {
  return {
    from: () => createChainableMock(null)
  };
}

describe('POST /api/alt-text', () => {
  test('requires image payload', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/alt-text', createAltTextRouter({
      supabase: createSupabaseMock(),
      redis: null,
      resultCache: new Map(),
      checkRateLimit: async () => true,
      getSiteFromHeaders: async () => ({ quota: 50, used: 0, remaining: 50 })
    }));
    const res = await request(app).post('/api/alt-text').send({});
    expect(res.status).toBe(400);
  });

  test('returns alt text on success', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/alt-text', createAltTextRouter({
      supabase: createSupabaseMock(),
      redis: null,
      resultCache: new Map(),
      checkRateLimit: async () => true,
      getSiteFromHeaders: async () => ({ quota: 50, used: 0, remaining: 50 })
    }));
    const res = await request(app).post('/api/alt-text').send({
      image: { url: 'https://example.com/img.jpg', width: 1, height: 1 }
    });
    expect(res.status).toBe(200);
    expect(res.body.altText).toBe('mock alt');
  });
});
