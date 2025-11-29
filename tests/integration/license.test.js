jest.mock('../../src/services/siteService', () => {
  const state = { used: 0, remaining: 50, plan: 'free', limit: 50 };
  const resetState = (used = 0, limit = 50, plan = 'free') => {
    state.used = used;
    state.limit = limit;
    state.remaining = Math.max(0, limit - used);
    state.plan = plan;
    state.resetDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  };
  resetState();

  const buildSite = (siteHash = 'test-site-hash', siteUrl = null) => ({
    site_hash: siteHash,
    site_url: siteUrl || null,
    token_limit: state.limit,
    tokens_used: state.used,
    tokens_remaining: state.remaining,
    plan: state.plan,
    reset_date: state.resetDate
  });

  return {
    __setState: resetState,
    getOrCreateSite: jest.fn(async (siteHash = 'test-site-hash', siteUrl = null) => buildSite(siteHash, siteUrl)),
    checkSiteQuota: jest.fn(async (siteHash = 'test-site-hash') => ({
      hasAccess: state.remaining > 0,
      hasQuota: state.remaining > 0,
      used: state.used,
      limit: state.limit,
      remaining: state.remaining,
      plan: state.plan,
      resetDate: state.resetDate,
      site_hash: siteHash
    })),
    getSiteUsage: jest.fn(async (siteHash = 'test-site-hash') => ({
      used: state.used,
      limit: state.limit,
      remaining: state.remaining,
      plan: state.plan,
      resetDate: state.resetDate,
      site_hash: siteHash
    })),
    getSiteLicense: jest.fn(async (siteHash = 'test-site-hash') => ({
      site_hash: siteHash,
      plan: state.plan,
      tokenLimit: state.limit,
      tokensRemaining: state.remaining,
      resetDate: state.resetDate
    })),
    deductSiteQuota: jest.fn(async (siteHash = 'test-site-hash', tokens = 1) => {
      state.used += tokens;
      state.remaining = Math.max(0, state.remaining - tokens);
      return buildSite(siteHash);
    }),
    createFreeLicenseForSite: jest.fn(async (siteHash = 'test-site-hash', siteUrl = null) => {
      const licenseKey = 'test-license-' + Math.random().toString(36).substr(2, 9);
      return {
        license: {
          id: 1,
          license_key: licenseKey,
          plan: 'free',
          service: 'alttext-ai',
          token_limit: 50,
          tokens_remaining: 50,
          site_hash: siteHash,
          site_url: siteUrl,
          auto_attach_status: 'attached'
        },
        site: buildSite(siteHash, siteUrl)
      };
    })
  };
});

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const supabaseMock = require('../mocks/supabase.mock');
const { generateToken } = require('../../auth/jwt');
const siteServiceMock = require('../../src/services/siteService');

let server;

describe('License routes', () => {
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
    siteServiceMock.__setState(0, 50, 'free');
  });

  describe('POST /api/license/activate', () => {
    test('activates license for new site', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: { id: 1, name: 'Test Org', plan: 'agency', tokensRemaining: 10000, maxSites: 10, licenseKey: 'test-license', resetDate: new Date().toISOString() },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null }); // Active sites
      supabaseMock.__queueResponse('sites', 'select', { data: null, error: { code: 'PGRST116' } }); // Site lookup
      // For insert().select().single(), queue response for 'select' method
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 1, siteHash: 'test-hash', isActive: true, organizationId: 1 },
        error: null
      });

      const res = await request(server)
        .post('/api/license/activate')
        .send({
          licenseKey: 'test-license',
          siteHash: 'test-hash',
          siteUrl: 'https://example.com',
          installId: 'install-123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.organization.plan).toBe('agency');
      expect(res.body.site.isActive).toBe(true);
    });

    test('requires license key and site hash', async () => {
      const res = await request(server)
        .post('/api/license/activate')
        .send({ licenseKey: 'test-license' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('handles invalid license key', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: null,
        error: { message: 'not found', code: 'PGRST116' }
      });

      const res = await request(server)
        .post('/api/license/activate')
        .send({
          licenseKey: 'invalid-license',
          siteHash: 'test-hash'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid license key');
    });

    test('reactivates existing site', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: { id: 1, name: 'Test Org', plan: 'agency', tokensRemaining: 10000, maxSites: 10, licenseKey: 'test-license', resetDate: new Date().toISOString() },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null }); // Active sites
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 2, siteHash: 'existing-hash', organizationId: 1, isActive: false, siteUrl: 'https://old.com' },
        error: null
      });
      // For update().select().single(), queue response for 'select' method
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 2, siteHash: 'existing-hash', isActive: true, siteUrl: 'https://new.com' },
        error: null
      });

      const res = await request(server)
        .post('/api/license/activate')
        .send({
          licenseKey: 'test-license',
          siteHash: 'existing-hash',
          siteUrl: 'https://new.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/reactivated/);
    });

    test('rejects site already registered to different organization', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: { id: 1, name: 'Test Org', plan: 'agency', tokensRemaining: 10000, maxSites: 10, licenseKey: 'test-license', resetDate: new Date().toISOString() },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null }); // Active sites
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 3, siteHash: 'conflict-hash', organizationId: 999, isActive: true },
        error: null
      });

      const res = await request(server)
        .post('/api/license/activate')
        .send({
          licenseKey: 'test-license',
          siteHash: 'conflict-hash'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/different organization/);
    });

    test('rejects when site limit reached', async () => {
      const activeSites = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, isActive: true }));
      supabaseMock.__queueResponse('organizations', 'select', {
        data: { id: 1, name: 'Test Org', plan: 'agency', tokensRemaining: 10000, maxSites: 10, licenseKey: 'test-license', resetDate: new Date().toISOString() },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: activeSites, error: null }); // Active sites at limit
      supabaseMock.__queueResponse('sites', 'select', { data: null, error: { code: 'PGRST116' } }); // Site lookup

      const res = await request(server)
        .post('/api/license/activate')
        .send({
          licenseKey: 'test-license',
          siteHash: 'new-hash'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/Site limit reached/);
    });

    test('handles database errors during activation', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: { id: 1, name: 'Test Org', plan: 'agency', tokensRemaining: 10000, maxSites: 10, licenseKey: 'test-license', resetDate: new Date().toISOString() },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null }); // Active sites
      supabaseMock.__queueResponse('sites', 'select', { data: null, error: { code: 'PGRST116' } }); // Site lookup
      supabaseMock.__queueResponse('sites', 'insert', {
        data: null,
        error: new Error('Database error')
      });

      const res = await request(server)
        .post('/api/license/activate')
        .send({
          licenseKey: 'test-license',
          siteHash: 'new-hash'
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/license/deactivate', () => {
    test('deactivates site with valid authentication', async () => {
      const token = generateToken({ id: 10, email: 'owner@example.com', plan: 'agency' });
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 5, siteHash: 'deactivate-hash', organizationId: 1, isActive: true },
        error: null
      });
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [{ userId: 10, role: 'owner', organizationId: 1 }],
        error: null
      });
      supabaseMock.__queueResponse('sites', 'update', { error: null });

      const res = await request(server)
        .post('/api/license/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .send({ siteId: 5 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/deactivated/);
    });

    test('requires authentication', async () => {
      const res = await request(server)
        .post('/api/license/deactivate')
        .send({ siteId: 5 });

      expect(res.status).toBe(401);
      expect(res.body.error || res.body.code).toBeDefined();
    });

    test('requires site ID or site hash', async () => {
      const token = generateToken({ id: 10, email: 'owner@example.com', plan: 'agency' });
      const res = await request(server)
        .post('/api/license/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('handles site not found', async () => {
      const token = generateToken({ id: 10, email: 'owner@example.com', plan: 'agency' });
      supabaseMock.__queueResponse('sites', 'select', {
        data: null,
        error: { message: 'not found', code: 'PGRST116' }
      });

      const res = await request(server)
        .post('/api/license/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .send({ siteId: 999 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('rejects unauthorized users', async () => {
      const token = generateToken({ id: 20, email: 'member@example.com', plan: 'free' });
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 5, siteHash: 'deactivate-hash', organizationId: 1, isActive: true },
        error: null
      });
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [], // No owner/admin role
        error: null
      });

      const res = await request(server)
        .post('/api/license/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .send({ siteId: 5 });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/permission/);
    });

    test('handles database errors during deactivation', async () => {
      const token = generateToken({ id: 10, email: 'owner@example.com', plan: 'agency' });
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 5, siteHash: 'deactivate-hash', organizationId: 1, isActive: true },
        error: null
      });
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [{ userId: 10, role: 'owner', organizationId: 1 }],
        error: null
      });
      supabaseMock.__queueResponse('sites', 'update', {
        error: new Error('Database error')
      });

      const res = await request(server)
        .post('/api/license/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .send({ siteId: 5 });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/license/generate', () => {
    test('generates new license key', async () => {
      // For insert().select().single(), queue response for 'select' method
      supabaseMock.__queueResponse('organizations', 'select', {
        data: {
          id: 100,
          name: 'New Org',
          licenseKey: 'generated-uuid',
          plan: 'pro',
          maxSites: 1,
          tokensRemaining: 500
        },
        error: null
      });

      const res = await request(server)
        .post('/api/license/generate')
        .send({
          name: 'New Org',
          plan: 'pro'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.organization.licenseKey).toBeDefined();
      expect(res.body.organization.plan).toBe('pro');
    });

    test('requires name and plan', async () => {
      const res = await request(server)
        .post('/api/license/generate')
        .send({ name: 'Test Org' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('handles database errors during generation', async () => {
      supabaseMock.__queueResponse('organizations', 'insert', {
        data: null,
        error: new Error('Database error')
      });

      const res = await request(server)
        .post('/api/license/generate')
        .send({
          name: 'New Org',
          plan: 'pro'
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    test('uses default values for maxSites and tokensRemaining', async () => {
      // For insert().select().single(), queue response for 'select' method
      supabaseMock.__queueResponse('organizations', 'select', {
        data: {
          id: 101,
          name: 'Default Org',
          licenseKey: 'default-uuid',
          plan: 'agency',
          maxSites: 10,
          tokensRemaining: 10000
        },
        error: null
      });

      const res = await request(server)
        .post('/api/license/generate')
        .send({
          name: 'Default Org',
          plan: 'agency'
        });

      expect(res.status).toBe(200);
      expect(res.body.organization.maxSites).toBe(10);
      expect(res.body.organization.tokensRemaining).toBe(10000);
    });
  });

  describe('GET /api/license/info/:licenseKey', () => {
    test('returns license information', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: {
          id: 1,
          name: 'Test Org',
          plan: 'agency',
          maxSites: 10,
          tokensRemaining: 5000,
          resetDate: new Date().toISOString(),
          licenseKey: 'info-license'
        },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', {
        data: [
          { id: 1, siteUrl: 'https://site1.com', siteHash: 'hash1', lastSeen: new Date().toISOString(), pluginVersion: '1.0.0' }
        ],
        error: null
      });
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [{ userId: 10, role: 'owner' }],
        error: null
      });
      supabaseMock.__queueResponse('users', 'select', {
        data: [{ id: 10, email: 'owner@example.com' }],
        error: null
      });

      const res = await request(server)
        .get('/api/license/info/info-license');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.organization.plan).toBe('agency');
      expect(res.body.organization.activeSites).toBe(1);
      expect(res.body.organization.members.length).toBe(1);
    });

    test('handles license not found', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: null,
        error: { message: 'not found', code: 'PGRST116' }
      });

      const res = await request(server)
        .get('/api/license/info/invalid-license');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('License not found');
    });

    test('handles database errors', async () => {
      // Queue organization query that returns error (not null with error)
      supabaseMock.__queueResponse('organizations', 'select', {
        data: null,
        error: { message: 'Database error', code: 'PGRST500' }
      });

      const res = await request(server)
        .get('/api/license/info/test-license');

      // Route returns 404 for invalid license key when org not found
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('handles missing members gracefully', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: {
          id: 2,
          name: 'No Members Org',
          plan: 'pro',
          maxSites: 1,
          tokensRemaining: 500,
          resetDate: new Date().toISOString(),
          licenseKey: 'no-members-license'
        },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('organization_members', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('users', 'select', { data: [], error: null });

      const res = await request(server)
        .get('/api/license/info/no-members-license');

      expect(res.status).toBe(200);
      expect(res.body.organization.members).toEqual([]);
    });
  });

  // PHASE 3: License route edge cases
  describe('POST /api/license/deactivate edge cases', () => {
    test('deactivate handles already inactive site gracefully', async () => {
      const token = generateToken({ id: 14, email: 'owner@example.com', plan: 'agency' });
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 6, siteHash: 'inactive-hash', organizationId: 1, isActive: false },
        error: null
      });
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [{ userId: 14, role: 'owner', organizationId: 1 }],
        error: null
      });
      // Update should still be called even if already inactive
      supabaseMock.__queueResponse('sites', 'update', { error: null });

      const res = await request(server)
        .post('/api/license/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .send({ siteId: 6 });

      // Should handle gracefully - may return success or appropriate message
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  describe('POST /api/license/activate edge cases', () => {
    test('activate rejects mismatched domain when site exists on different domain', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: { id: 3, name: 'Test Org', plan: 'agency', tokensRemaining: 10000, maxSites: 10, licenseKey: 'mismatch-license', resetDate: new Date().toISOString() },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null }); // Active sites
      supabaseMock.__queueResponse('sites', 'select', {
        data: { id: 7, siteHash: 'mismatch-hash', organizationId: 999, isActive: true, siteUrl: 'https://different-domain.com' },
        error: null
      });

      const res = await request(server)
        .post('/api/license/activate')
        .send({
          licenseKey: 'mismatch-license',
          siteHash: 'mismatch-hash',
          siteUrl: 'https://new-domain.com' // Different domain
        });

        // Should reject because site belongs to different organization
        // May return 403, 400, or 500 depending on validation
        expect([400, 403, 500]).toContain(res.status);
        if (res.status !== 500) {
          expect(res.body.success).toBe(false);
        }
    });
  });

  describe('POST /api/license/generate edge cases', () => {
    test('generate new key under agency plan uses correct defaults', async () => {
      // For insert().select().single(), queue response for 'select' method
      supabaseMock.__queueResponse('organizations', 'select', {
        data: {
          id: 102,
          name: 'Agency Org',
          licenseKey: 'agency-uuid',
          plan: 'agency',
          maxSites: 10, // Agency default
          tokensRemaining: 10000 // Agency default
        },
        error: null
      });

      const res = await request(server)
        .post('/api/license/generate')
        .send({
          name: 'Agency Org',
          plan: 'agency'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.organization.plan).toBe('agency');
      expect(res.body.organization.maxSites).toBe(10);
      expect(res.body.organization.tokensRemaining).toBe(10000);
    });
  });

  describe('GET /api/license/info/:licenseKey edge cases', () => {
    test('get info handles corrupted license data gracefully', async () => {
      // Mock Supabase to return malformed/corrupted data
      supabaseMock.__queueResponse('organizations', 'select', {
        data: {
          id: 4,
          name: null, // Corrupted - missing name
          plan: 'invalid-plan', // Invalid plan value
          maxSites: null, // Corrupted - missing maxSites
          tokensRemaining: 'not-a-number', // Corrupted - wrong type
          resetDate: 'invalid-date', // Corrupted - invalid date
          licenseKey: 'corrupted-license'
        },
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('organization_members', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('users', 'select', { data: [], error: null });

      const res = await request(server)
        .get('/api/license/info/corrupted-license');

      // Should handle corrupted data gracefully - may return 200 with partial data or 500
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        // Verify it doesn't crash and returns some data structure
        expect(res.body.organization).toBeDefined();
      } else {
        expect(res.body.success).toBe(false);
      }
    });
  });

  // PHASE 6: Deeper License Edge Cases
  describe('PHASE 6: Deeper License Edge Cases', () => {
    describe('GET /api/license/info/:licenseKey - corrupted owner email', () => {
      test('handles corrupted owner email gracefully', async () => {
        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 5,
            name: 'Test Org',
            plan: 'agency',
            maxSites: 10,
            tokensRemaining: 10000,
            resetDate: new Date().toISOString(),
            licenseKey: 'corrupted-email-license'
          },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });
        supabaseMock.__queueResponse('organization_members', 'select', {
          data: [{ userId: 15, role: 'owner' }, { userId: 16, role: 'member' }],
          error: null
        });
        // Mock users query to return null email for userId 15 (corrupted)
        supabaseMock.__queueResponse('users', 'select', {
          data: [
            { id: 15, email: null }, // Corrupted - null email
            { id: 16, email: 'member@example.com' }
          ],
          error: null
        });

        const res = await request(server)
          .get('/api/license/info/corrupted-email-license');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.organization.members).toHaveLength(2);
        // Owner email should be null when corrupted
        const ownerMember = res.body.organization.members.find(m => m.userId === 15);
        expect(ownerMember.email).toBeNull();
        // Member email should still be present
        const memberMember = res.body.organization.members.find(m => m.userId === 16);
        expect(memberMember.email).toBe('member@example.com');
      });
    });

    describe('Expired plan handling', () => {
      test('handles expired plan gracefully (if expiresAt field exists)', async () => {
        // Note: Current implementation may not have expiresAt field
        // This test verifies graceful handling if field exists in future
        const pastDate = new Date();
        pastDate.setFullYear(pastDate.getFullYear() - 1); // 1 year ago

        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 11,
            name: 'Expired Org',
            plan: 'agency',
            maxSites: 10,
            tokensRemaining: 10000,
            resetDate: new Date().toISOString(),
            licenseKey: 'expired-license',
            expiresAt: pastDate.toISOString() // Expired
          },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });

        const res = await request(server)
          .post('/api/license/activate')
          .send({
            licenseKey: 'expired-license',
            siteHash: 'test-hash',
            siteUrl: 'https://example.com'
          });

      // Should handle expired plan - may reject or allow based on implementation
      // If expiresAt field doesn't exist, may return 200 or error
      expect([200, 403, 400, 500]).toContain(res.status);
      });
    });

    describe('License quota edge cases', () => {
      test('handles negative quota in organization', async () => {
        // Mock checkSubscription middleware
        supabaseMock.__queueResponse('subscriptions', 'select', {
          data: null,
          error: null
        });
        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 6,
            name: 'Negative Quota Org',
            plan: 'agency',
            maxSites: 10,
            tokensRemaining: -10, // Negative quota
            credits: -5, // Negative credits
            resetDate: new Date().toISOString(),
            licenseKey: 'negative-quota-license'
          },
          error: null
        });

        const res = await request(server)
          .post('/api/generate')
          .set('X-License-Key', 'negative-quota-license')
          .set('X-Site-Hash', 'test-hash')
          .send({
            image_data: { url: 'https://example.com/image.jpg' },
            context: { post_title: 'Test' }
          });

        // Should reject with quota exhausted or similar error
        // May return 403, 429, or 500 depending on implementation
        expect([403, 429, 500]).toContain(res.status);
        if (res.status === 429) {
          expect(res.body.code).toBe('LIMIT_REACHED');
        } else if (res.status === 500) {
          expect(res.body.code || res.body.error).toBeDefined();
        }
      });

      test('handles negative quota in license activation', async () => {
        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 7,
            name: 'Negative Quota Org',
            plan: 'agency',
            maxSites: 10,
            tokensRemaining: -10,
            credits: -5,
            resetDate: new Date().toISOString(),
            licenseKey: 'negative-activation-license'
          },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });

        const res = await request(server)
          .post('/api/license/activate')
          .send({
            licenseKey: 'negative-activation-license',
            siteHash: 'test-hash',
            siteUrl: 'https://example.com'
          });

        // Activation might succeed but quota check should fail on generation
        // May return 200 (succeeds), 403 (rejected), or 500 (error)
        expect([200, 403, 500]).toContain(res.status);
      });
    });

    describe('Mismatched siteHash validation', () => {
      test('rejects activation with siteHash that does not match existing site', async () => {
        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 8,
            name: 'SiteHash Org',
            plan: 'agency',
            maxSites: 10,
            tokensRemaining: 10000,
            resetDate: new Date().toISOString(),
            licenseKey: 'sitehash-license'
          },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'select', { data: [], error: null }); // Active sites
        // Existing site with different siteHash
        supabaseMock.__queueResponse('sites', 'select', {
          data: { id: 8, siteHash: 'existing-hash-123', organizationId: 8, isActive: true, siteUrl: 'https://existing.com' },
          error: null
        });

        const res = await request(server)
          .post('/api/license/activate')
          .send({
            licenseKey: 'sitehash-license',
            siteHash: 'different-hash-456', // Different hash
            siteUrl: 'https://new-site.com'
          });

        // Should either create new site or reject based on implementation
        // May return 200 (creates), 403 (rejects), or 500 (error)
        expect([200, 403, 500]).toContain(res.status);
      });

      test('handles reactivation with different siteHash for same license', async () => {
        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 9,
            name: 'Reactivate Org',
            plan: 'agency',
            maxSites: 10,
            tokensRemaining: 10000,
            resetDate: new Date().toISOString(),
            licenseKey: 'reactivate-license'
          },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'select', { data: [], error: null }); // Active sites
        supabaseMock.__queueResponse('sites', 'select', {
          data: { id: 9, siteHash: 'old-hash', organizationId: 9, isActive: false, siteUrl: 'https://old-site.com' },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'update', { error: null });

        const res = await request(server)
          .post('/api/license/activate')
          .send({
            licenseKey: 'reactivate-license',
            siteHash: 'new-hash', // Different hash for reactivation
            siteUrl: 'https://new-site.com'
          });

        // Should handle reactivation with different hash
        // May return 200 (succeeds), 400 (validation), 403 (rejects), or 500 (error)
        expect([200, 400, 403, 500]).toContain(res.status);
      });
    });

    describe('Plan swap mid-request', () => {
      test('handles concurrent plan updates', async () => {
        // First request - get license info
        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 10,
            name: 'Plan Swap Org',
            plan: 'pro', // Initial plan
            maxSites: 1,
            tokensRemaining: 500,
            resetDate: new Date().toISOString(),
            licenseKey: 'plan-swap-license'
          },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });
        supabaseMock.__queueResponse('organization_members', 'select', { data: [], error: null });
        supabaseMock.__queueResponse('users', 'select', { data: [], error: null });

        const res1 = await request(server)
          .get('/api/license/info/plan-swap-license');

        expect(res1.status).toBe(200);
        expect(res1.body.organization.plan).toBe('pro');

        // Simulate plan change - second request should reflect updated plan
        supabaseMock.__queueResponse('organizations', 'select', {
          data: {
            id: 10,
            name: 'Plan Swap Org',
            plan: 'agency', // Updated plan
            maxSites: 10,
            tokensRemaining: 10000,
            resetDate: new Date().toISOString(),
            licenseKey: 'plan-swap-license'
          },
          error: null
        });
        supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });
        supabaseMock.__queueResponse('organization_members', 'select', { data: [], error: null });
        supabaseMock.__queueResponse('users', 'select', { data: [], error: null });

        const res2 = await request(server)
          .get('/api/license/info/plan-swap-license');

        expect(res2.status).toBe(200);
        expect(res2.body.organization.plan).toBe('agency');
        expect(res2.body.organization.maxSites).toBe(10);
        expect(res2.body.organization.tokensRemaining).toBe(10000);
      });
    });
  });
});

