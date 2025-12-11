const { validateLicense, getLimits } = require('../../services/license');

function createSupabaseMock(returnData) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: returnData, error: returnData ? null : new Error('not found') })
        })
      })
    })
  };
}

describe('license service', () => {
  test('rejects missing license key', async () => {
    const supabase = createSupabaseMock(null);
    const result = await validateLicense(supabase, '');
    expect(result.error).toBe('INVALID_LICENSE');
    expect(result.status).toBe(401);
  });

  test('returns limits by plan', () => {
    expect(getLimits('free').credits).toBe(50);
    expect(getLimits('pro').credits).toBe(1000);
    expect(getLimits('agency').maxSites).toBeNull();
  });
});
