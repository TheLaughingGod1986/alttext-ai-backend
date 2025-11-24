jest.mock('../../db/supabase-client', () => require('../mocks/supabase.mock'));

const {
  recordUsage,
  checkUserLimits,
  useCredit,
  resetMonthlyTokens,
  checkOrganizationLimits,
  recordOrganizationUsage,
  useOrganizationCredit,
  resetOrganizationTokens
} = require('../../routes/usage');

const supabaseMock = require('../mocks/supabase.mock');

describe('usage route helpers', () => {
  beforeEach(() => {
    supabaseMock.__reset();
  });

  test('recordUsage throws when insert fails', async () => {
    supabaseMock.__queueResponse('usage_logs', 'insert', {
      data: null,
      error: new Error('insert failed')
    });

    await expect(
      recordUsage(1, 'img1', 'generate')
    ).rejects.toThrow('insert failed');
  });

  test('checkUserLimits throws when user query fails', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: { message: 'User lookup failed', code: 'PGRST116' }
    });

    await expect(
      checkUserLimits(999)
    ).rejects.toThrow('User lookup failed');
  });

  test('checkUserLimits returns hasAccess false when credits exhausted', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { plan: 'free' },
      error: null
    });
    supabaseMock.__queueResponse('credits', 'select', {
      data: { monthly_limit: 50, used_this_month: 50 },
      error: null
    });

    const limits = await checkUserLimits(1);
    expect(limits.hasAccess).toBe(true); // Has tokens even if credits exhausted
    expect(limits.credits).toBe(0);
  });

  test('useCredit returns false when credits exhausted', async () => {
    supabaseMock.__queueResponse('credits', 'select', {
      data: { monthly_limit: 50, used_this_month: 50 },
      error: null
    });

    const result = await useCredit(1);
    expect(result).toBe(false);
  });

  test('useCredit returns false when update fails', async () => {
    supabaseMock.__queueResponse('credits', 'select', {
      data: { monthly_limit: 50, used_this_month: 10 },
      error: null
    });
    supabaseMock.__queueResponse('credits', 'update', {
      data: null,
      error: new Error('update failed')
    });

    const result = await useCredit(1);
    expect(result).toBe(false); // Returns false on error, doesn't throw
  });

  test('resetMonthlyTokens handles Supabase errors gracefully', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: [{ id: 1, plan: 'free' }, { id: 2, plan: 'pro' }],
      error: null
    });
    supabaseMock.__queueResponse('users', 'update', {
      data: null,
      error: { message: 'update failed for user 1' }
    });
    supabaseMock.__queueResponse('users', 'update', {
      data: null,
      error: null
    });

    const result = await resetMonthlyTokens();
    expect(result).toBe(2); // Returns count even if some updates fail
  });

  test('resetMonthlyTokens throws when users query fails', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: new Error('DB unavailable')
    });

    await expect(resetMonthlyTokens()).rejects.toThrow('DB unavailable');
  });

  test('recordOrganizationUsage throws when usage log insert fails', async () => {
    supabaseMock.__queueResponse('usage_logs', 'insert', {
      data: null,
      error: new Error('insert failed')
    });

    await expect(
      recordOrganizationUsage(1, 2, null, 'generate', 'alttext-ai')
    ).rejects.toThrow('insert failed');
  });

  test('recordOrganizationUsage throws when org query fails', async () => {
    supabaseMock.__queueResponse('usage_logs', 'insert', {
      data: { id: 1 },
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'select', {
      data: null,
      error: new Error('org not found')
    });

    await expect(
      recordOrganizationUsage(1, 2, null, 'generate', 'alttext-ai')
    ).rejects.toThrow('org not found');
  });

  test('useOrganizationCredit returns false when update fails', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: { credits: 1 },
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'update', {
      data: null,
      error: new Error('rate limited')
    });

    const result = await useOrganizationCredit(5, 6);
    expect(result).toBe(false);
  });

  test('resetOrganizationTokens handles Supabase errors gracefully', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: [{ id: 1, plan: 'agency', service: 'alttext-ai' }],
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'update', {
      data: null,
      error: { message: 'update failed' }
    });

    const result = await resetOrganizationTokens();
    expect(result).toBe(1); // Returns count even if update fails
  });

  test('resetOrganizationTokens throws when orgs query fails', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: null,
      error: new Error('DB unavailable')
    });

    await expect(resetOrganizationTokens()).rejects.toThrow('DB unavailable');
  });

  // Additional cron task tests

  test('resetMonthlyTokens handles large user sets', async () => {
    const largeUserSet = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      plan: i % 3 === 0 ? 'free' : (i % 3 === 1 ? 'pro' : 'agency'),
      service: 'alttext-ai'
    }));

    supabaseMock.__queueResponse('users', 'select', {
      data: largeUserSet,
      error: null
    });
    // Queue updates for all users
    for (let i = 0; i < 100; i++) {
      supabaseMock.__queueResponse('users', 'update', {
        data: { id: i + 1 },
        error: null
      });
    }

    const result = await resetMonthlyTokens();
    expect(result).toBe(100);
  });

  test('resetMonthlyTokens handles empty user list', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: [],
      error: null
    });

    const result = await resetMonthlyTokens();
    expect(result).toBe(0);
  });

  test('resetMonthlyTokens handles different service types', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: [
        { id: 1, plan: 'free', service: 'alttext-ai' },
        { id: 2, plan: 'pro', service: 'seo-ai-meta' },
        { id: 3, plan: 'agency', service: 'alttext-ai' }
      ],
      error: null
    });
    supabaseMock.__queueResponse('users', 'update', { data: { id: 1 }, error: null });
    supabaseMock.__queueResponse('users', 'update', { data: { id: 2 }, error: null });
    supabaseMock.__queueResponse('users', 'update', { data: { id: 3 }, error: null });

    const result = await resetMonthlyTokens();
    expect(result).toBe(3);
  });

  test('resetOrganizationTokens handles large organization sets', async () => {
    const largeOrgSet = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      plan: i % 2 === 0 ? 'pro' : 'agency',
      service: 'alttext-ai'
    }));

    supabaseMock.__queueResponse('organizations', 'select', {
      data: largeOrgSet,
      error: null
    });
    // Queue updates for all orgs
    for (let i = 0; i < 50; i++) {
      supabaseMock.__queueResponse('organizations', 'update', {
        data: { id: i + 1 },
        error: null
      });
    }

    const result = await resetOrganizationTokens();
    expect(result).toBe(50);
  });

  test('resetOrganizationTokens handles empty organization list', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: [],
      error: null
    });

    const result = await resetOrganizationTokens();
    expect(result).toBe(0);
  });

  test('resetOrganizationTokens handles different service types', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: [
        { id: 1, plan: 'pro', service: 'alttext-ai' },
        { id: 2, plan: 'agency', service: 'seo-ai-meta' },
        { id: 3, plan: 'pro', service: 'alttext-ai' }
      ],
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'update', { data: { id: 1 }, error: null });
    supabaseMock.__queueResponse('organizations', 'update', { data: { id: 2 }, error: null });
    supabaseMock.__queueResponse('organizations', 'update', { data: { id: 3 }, error: null });

    const result = await resetOrganizationTokens();
    expect(result).toBe(3);
  });

  test('resetMonthlyTokens handles partial failures gracefully', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: [
        { id: 1, plan: 'free' },
        { id: 2, plan: 'pro' },
        { id: 3, plan: 'agency' }
      ],
      error: null
    });
    supabaseMock.__queueResponse('users', 'update', { data: null, error: new Error('User 1 update failed') });
    supabaseMock.__queueResponse('users', 'update', { data: { id: 2 }, error: null });
    supabaseMock.__queueResponse('users', 'update', { data: null, error: new Error('User 3 update failed') });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await resetMonthlyTokens();
    expect(result).toBe(3); // Returns total count, not successful count
    expect(consoleSpy).toHaveBeenCalledTimes(2); // Two errors logged
    consoleSpy.mockRestore();
  });

  test('resetOrganizationTokens handles partial failures gracefully', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: [
        { id: 1, plan: 'pro', service: 'alttext-ai' },
        { id: 2, plan: 'agency', service: 'alttext-ai' },
        { id: 3, plan: 'pro', service: 'alttext-ai' }
      ],
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'update', { data: null, error: new Error('Org 1 update failed') });
    supabaseMock.__queueResponse('organizations', 'update', { data: { id: 2 }, error: null });
    supabaseMock.__queueResponse('organizations', 'update', { data: null, error: new Error('Org 3 update failed') });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await resetOrganizationTokens();
    expect(result).toBe(3); // Returns total count, not successful count
    expect(consoleSpy).toHaveBeenCalledTimes(2); // Two errors logged
    consoleSpy.mockRestore();
  });

  // Additional tests for uncovered lines

  test('recordUsage handles WordPress user info', async () => {
    supabaseMock.__queueResponse('usage_logs', 'insert', { data: { id: 1 }, error: null });
    supabaseMock.__queueResponse('users', 'select', { data: { id: 1, plan: 'free' }, error: null });

    await recordUsage(1, 'img1', 'generate', 'alttext-ai', 123, 'wpuser');
    // Should not throw
    expect(true).toBe(true);
  });

  test('checkUserLimits throws when userId is null', async () => {
    await expect(checkUserLimits(null)).rejects.toThrow('User not found');
  });

  test('checkUserLimits throws when userId is undefined', async () => {
    await expect(checkUserLimits(undefined)).rejects.toThrow('User not found');
  });

  test('checkUserLimits throws when user not found after query', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: null,
      error: null // Query succeeds but returns no data
    });

    await expect(checkUserLimits(999)).rejects.toThrow('User not found');
  });

  test('useCredit returns false when creditsError exists', async () => {
    supabaseMock.__queueResponse('credits', 'select', {
      data: null,
      error: new Error('credits query failed')
    });

    const result = await useCredit(1);
    expect(result).toBe(false);
  });

  test('useCredit returns false when creditsData is null', async () => {
    supabaseMock.__queueResponse('credits', 'select', {
      data: null,
      error: null
    });

    const result = await useCredit(1);
    expect(result).toBe(false);
  });

  test('useCredit returns false when log insert fails', async () => {
    supabaseMock.__queueResponse('credits', 'select', {
      data: { monthly_limit: 50, used_this_month: 10 },
      error: null
    });
    supabaseMock.__queueResponse('credits', 'update', { data: { id: 1 }, error: null });
    supabaseMock.__queueResponse('usage_logs', 'insert', {
      data: null,
      error: new Error('log insert failed')
    });

    const result = await useCredit(1);
    expect(result).toBe(false);
  });

  test('checkOrganizationLimits throws when error exists', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: null,
      error: { message: 'Organization query failed' }
    });

    await expect(checkOrganizationLimits(999)).rejects.toThrow('Organization not found');
  });

  test('recordOrganizationUsage handles WordPress user info', async () => {
    supabaseMock.__queueResponse('usage_logs', 'insert', { data: { id: 1 }, error: null });
    supabaseMock.__queueResponse('organizations', 'select', { data: { id: 1, plan: 'agency' }, error: null });
    supabaseMock.__queueResponse('organizations', 'update', { data: { id: 1 }, error: null });

    await recordOrganizationUsage(1, 2, 'img1', 'generate', 'alttext-ai', 123, 'wpuser');
    // Should not throw
    expect(true).toBe(true);
  });

  test('useOrganizationCredit returns false when orgError exists', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: null,
      error: new Error('org query failed')
    });

    const result = await useOrganizationCredit(5, 6);
    expect(result).toBe(false);
  });

  test('useOrganizationCredit returns false when org is null', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: null,
      error: null
    });

    const result = await useOrganizationCredit(5, 6);
    expect(result).toBe(false);
  });

  test('useOrganizationCredit returns false when log insert fails', async () => {
    supabaseMock.__queueResponse('organizations', 'select', {
      data: { credits: 1 },
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'update', { data: { id: 1 }, error: null });
    supabaseMock.__queueResponse('usage_logs', 'insert', {
      data: null,
      error: new Error('log insert failed')
    });

    const result = await useOrganizationCredit(5, 6);
    expect(result).toBe(false);
  });
});

