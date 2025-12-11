const express = require('express');
const request = require('supertest');
const { createUsageRouter } = require('../../routes/usage');

function createSupabaseMock() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { plan: 'agency' }, error: null })
        })
      })
    })
  };
}

describe('GET /usage/sites', () => {
  test('rejects non-agency license', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { plan: 'pro' }, error: null })
          })
        })
      })
    };
    const app = express();
    app.use('/usage', createUsageRouter({ supabase }));
    const res = await request(app).get('/usage/sites').set('X-License-Key', 'key');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_NOT_SUPPORTED');
  });

  test('returns sites for agency license (empty list mocked)', async () => {
    const supabase = createSupabaseMock();
    const app = express();
    app.use('/usage', createUsageRouter({ supabase }));
    const res = await request(app).get('/usage/sites').set('X-License-Key', 'key');
    expect(res.status).toBe(200);
    expect(res.body.plan_type).toBe('agency');
  });
});
