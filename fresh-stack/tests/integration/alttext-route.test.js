const express = require('express');
const request = require('supertest');

jest.mock('../../lib/openai', () => ({
  generateAltText: jest.fn().mockResolvedValue({
    altText: 'mock alt',
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    meta: { modelUsed: 'mock', generation_time_ms: 1 }
  })
}));

const { createAltTextRouter } = require('../../routes/altText');

function createSupabaseMock() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null })
        })
      })
    })
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
