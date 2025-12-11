/**
 * Lightweight integration-style test using mocked Supabase client.
 */

const { activateLicense } = require('../../services/license');

function createSupabaseMock() {
  const sites = [];
  return {
    from: (table) => {
      if (table === 'licenses') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: 'lic-1', license_key: 'key-123', plan: 'pro', status: 'active', billing_day_of_month: 1 },
                  error: null
                })
            })
          })
        };
      }
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null }),
                single: () => Promise.resolve({ data: null })
              })
            })
          }),
          upsert: (payload) => ({
            select: () => ({
              single: () => {
                sites.push(payload);
                return Promise.resolve({ data: payload, error: null });
              }
            })
          })
        };
      }
      return {};
    }
  };
}

describe('license activation flow', () => {
  test('activates a new site', async () => {
    const supabase = createSupabaseMock();
    const result = await activateLicense(supabase, {
      licenseKey: 'key-123',
      siteHash: 'site-1',
      siteUrl: 'https://example.com'
    });
    expect(result.error).toBeUndefined();
    expect(result.site.site_hash).toBe('site-1');
  });
});
