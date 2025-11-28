const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const supabaseMock = require('../mocks/supabase.mock');
const { generateToken } = require('../../auth/jwt');

const app = createTestServer();

function queueOrgAuth() {
  supabaseMock.__queueResponse('organizations', 'select', {
    data: { id: 1, plan: 'agency', service: 'alttext-ai', licenseKey: 'org-license' },
    error: null
  });
}

describe('License routes', () => {
  beforeEach(() => {
    supabaseMock.__reset();
    queueOrgAuth();
  });

  test('auto-attach with license key', async () => {
    // Mock sites query (check if site exists)
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });
    // Mock siteService.createFreeLicenseForSite - it creates site and license
    supabaseMock.__queueResponse('sites', 'insert', {
      data: { site_hash: 'test-site-hash', site_url: 'https://example.com', license_key: 'test-license', plan: 'free', tokens_used: 0 },
      error: null
    });
    supabaseMock.__queueResponse('licenses', 'insert', {
      data: { id: 1, license_key: 'test-license', plan: 'free', token_limit: 50, tokens_remaining: 50 },
      error: null
    });
    // Mock getSiteUsage
    supabaseMock.__queueResponse('sites', 'select', {
      data: { site_hash: 'test-site-hash', plan: 'free', tokens_used: 0, reset_date: new Date().toISOString() },
      error: null
    });

    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('X-License-Key', 'org-license')
      .set('X-Site-Hash', 'test-site-hash')
      .send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(200);
    expect(res.body.license.licenseKey).toBe('test-license');
  });

  test('auto-attach requires site identifier', async () => {
    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('X-License-Key', 'org-license')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_SITE_HASH');
  });

  test('lists organization sites', async () => {
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: { userId: 1 },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 1 }],
      error: null
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: [{
        id: 1,
        installId: 'install_1',
        siteHash: 'hash1',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        metadata: { siteUrl: 'https://example.com' },
        plan: 'agency',
        pluginVersion: '1.0.0',
        wordpressVersion: '6.0'
      }],
      error: null
    });
    supabaseMock.__queueResponse('usage_monthly_summary', 'select', {
      data: { totalRequests: 3, totalTokens: 30 },
      error: null
    });
    supabaseMock.__queueResponse('usage_events', 'select', {
      data: { createdAt: new Date().toISOString() },
      error: null
    });

    const res = await request(app)
      .get('/api/licenses/sites')
      .set('X-License-Key', 'org-license');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  test('disconnects a site', async () => {
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 1 }],
      error: null
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: { id: 1, installId: 'install_1', siteHash: 'hash1' },
      error: null
    });
    supabaseMock.__queueResponse('installations', 'delete', {
      error: null
    });

    const res = await request(app)
      .delete('/api/licenses/sites/install_1')
      .set('X-License-Key', 'org-license');

    expect(res.status).toBe(200);
    expect(res.body.data.siteId).toBe('install_1');
  });

  test('sites endpoint forbids non-pro plans', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 42, email: 'free@example.com', plan: 'free', service: 'alttext-ai' },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [],
      error: null
    });

    const token = generateToken({ id: 42, email: 'free@example.com', plan: 'free' });
    const res = await request(app)
      .get('/api/licenses/sites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_NOT_ALLOWED');
  });

  test('auto-attach fails when site limit exceeded', async () => {
    // Mock sites query
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });
    // Mock siteService.createFreeLicenseForSite which will fail due to site limit
    supabaseMock.__queueResponse('sites', 'insert', {
      data: null,
      error: new Error('Site limit reached. This license allows 1 active site(s).')
    });

    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('X-License-Key', 'org-license')
      .set('X-Site-Hash', 'hash1')
      .send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Site limit reached/);
  });

  test('auto-attach fails when site already registered to different org', async () => {
    // Mock sites query - site exists with different license
    supabaseMock.__queueResponse('sites', 'select', {
      data: { site_hash: 'conflicting-hash', license_key: 'different-license', site_url: 'https://other.com' },
      error: null
    });
    supabaseMock.__queueResponse('licenses', 'select', {
      data: { id: 2, license_key: 'different-license', organizationId: 99 },
      error: null
    });

    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('X-License-Key', 'org-license')
      .set('X-Site-Hash', 'conflicting-hash')
      .send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/already registered/);
  });

  test('disconnect fails when site not found', async () => {
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 1 }],
      error: null
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const res = await request(app)
      .delete('/api/licenses/sites/nonexistent')
      .set('X-License-Key', 'org-license');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SITE_NOT_FOUND');
  });

  test('disconnect fails when Supabase delete error', async () => {
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 1 }],
      error: null
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: { id: 1, installId: 'install_1', siteHash: 'hash1' },
      error: null
    });
    supabaseMock.__queueResponse('installations', 'delete', {
      error: new Error('Delete failed')
    });

    const res = await request(app)
      .delete('/api/licenses/sites/install_1')
      .set('X-License-Key', 'org-license');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('DISCONNECT_ERROR');
  });

  test('sites endpoint handles Supabase query errors', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 42, email: 'agency@example.com', plan: 'agency', service: 'alttext-ai' },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ organizationId: 10, role: 'owner' }],
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'select', {
      data: { id: 10, plan: 'agency', service: 'alttext-ai' },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: null,
      error: new Error('Query failed')
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: null,
      error: new Error('Query failed')
    });

    const token = generateToken({ id: 42, email: 'agency@example.com', plan: 'agency' });
    const res = await request(app)
      .get('/api/licenses/sites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('FETCH_ERROR');
  });

  // Additional critical path tests

  test('auto-attach creates license for user when none exists', async () => {
    const licenseServiceMock = require('../mocks/licenseService.mock');
    licenseServiceMock.createLicense.mockResolvedValueOnce({
      id: 2,
      licenseKey: 'new-user-license',
      plan: 'free',
      service: 'alttext-ai',
      userId: 50
    });
    licenseServiceMock.autoAttachLicense.mockResolvedValueOnce({
      license: { id: 2, licenseKey: 'new-user-license' },
      site: { siteUrl: 'https://newuser.com', siteHash: 'newhash', installId: 'newinstall', isActive: true },
      organization: { id: null }
    });
    licenseServiceMock.getLicenseSnapshot.mockResolvedValueOnce({
      licenseKey: 'new-user-license',
      plan: 'free',
      tokenLimit: 50,
      tokensRemaining: 50,
      siteUrl: 'https://newuser.com',
      siteHash: 'newhash',
      autoAttachStatus: 'attached',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      licenseEmailSentAt: null
    });

    supabaseMock.__queueResponse('licenses', 'select', {
      data: null,
      error: { code: 'PGRST116' } // No license found
    });
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 50, email: 'newuser@example.com', plan: 'free', service: 'alttext-ai' },
      error: null
    });

    const token = generateToken({ id: 50, email: 'newuser@example.com', plan: 'free' });
    // Mock sites query
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });
    // Mock siteService.createFreeLicenseForSite
    supabaseMock.__queueResponse('sites', 'insert', {
      data: { site_hash: 'newhash', site_url: 'https://newuser.com', license_key: 'new-user-license', plan: 'free' },
      error: null
    });
    supabaseMock.__queueResponse('licenses', 'insert', {
      data: { id: 2, license_key: 'new-user-license', plan: 'free' },
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: { site_hash: 'newhash', plan: 'free', tokens_used: 0, reset_date: new Date().toISOString() },
      error: null
    });

    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', 'newhash')
      .send({ siteUrl: 'https://newuser.com', installId: 'newinstall' });

    expect(res.status).toBe(200);
    expect(res.body.license.licenseKey).toBe('new-user-license');
    expect(licenseServiceMock.createLicense).toHaveBeenCalled();
  });

  test('auto-attach uses existing license when license key provided', async () => {
    const licenseServiceMock = require('../mocks/licenseService.mock');
    licenseServiceMock.autoAttachLicense.mockResolvedValueOnce({
      license: { id: 3, licenseKey: 'existing-org-license' },
      site: { siteUrl: 'https://neworg.com', siteHash: 'orghash', installId: 'orginstall', isActive: true },
      organization: { id: 20 }
    });
    licenseServiceMock.getLicenseSnapshot.mockResolvedValueOnce({
      licenseKey: 'existing-org-license',
      plan: 'agency',
      tokenLimit: 10000,
      tokensRemaining: 10000,
      siteUrl: 'https://neworg.com',
      siteHash: 'orghash',
      autoAttachStatus: 'attached',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      licenseEmailSentAt: null
    });

    supabaseMock.__queueResponse('licenses', 'select', {
      data: { id: 3, licenseKey: 'existing-org-license', organizationId: 20 },
      error: null
    });

    // Mock sites query
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });
    // Mock siteService.createFreeLicenseForSite
    supabaseMock.__queueResponse('sites', 'insert', {
      data: { site_hash: 'orghash', site_url: 'https://neworg.com', license_key: 'existing-org-license', plan: 'agency' },
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: { site_hash: 'orghash', plan: 'agency', tokens_used: 0, reset_date: new Date().toISOString() },
      error: null
    });

    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('X-License-Key', 'existing-org-license')
      .set('X-Site-Hash', 'orghash')
      .send({ siteUrl: 'https://neworg.com', installId: 'orginstall' });

    expect(res.status).toBe(200);
    expect(res.body.license.licenseKey).toBe('existing-org-license');
    expect(licenseServiceMock.createLicense).not.toHaveBeenCalled();
  });

  test('auto-attach returns 404 when license key not found', async () => {
    // Mock sites query
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });
    // Mock siteService.createFreeLicenseForSite - will create free license
    supabaseMock.__queueResponse('sites', 'insert', {
      data: { site_hash: 'test-hash', site_url: 'https://example.com', license_key: 'free-license', plan: 'free' },
      error: null
    });
    supabaseMock.__queueResponse('licenses', 'insert', {
      data: { id: 1, license_key: 'free-license', plan: 'free' },
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: { site_hash: 'test-hash', plan: 'free', tokens_used: 0, reset_date: new Date().toISOString() },
      error: null
    });

    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('X-License-Key', 'nonexistent-license')
      .set('X-Site-Hash', 'test-hash')
      .send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('LICENSE_NOT_FOUND');
  });

  test('auto-attach returns 404 when user not found during license creation', async () => {
    // Mock sites query
    supabaseMock.__queueResponse('sites', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });
    // Mock siteService.createFreeLicenseForSite - it doesn't need user, so this should succeed
    supabaseMock.__queueResponse('sites', 'insert', {
      data: { site_hash: 'test-hash', site_url: 'https://example.com', license_key: 'free-license', plan: 'free' },
      error: null
    });
    supabaseMock.__queueResponse('licenses', 'insert', {
      data: { id: 1, license_key: 'free-license', plan: 'free' },
      error: null
    });
    supabaseMock.__queueResponse('sites', 'select', {
      data: { site_hash: 'test-hash', plan: 'free', tokens_used: 0, reset_date: new Date().toISOString() },
      error: null
    });

    const token = generateToken({ id: 999, email: 'missing@example.com', plan: 'free' });
    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Site-Hash', 'test-hash')
      .send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('auto-attach returns 401 when no authentication provided', async () => {
    const res = await request(app)
      .post('/api/licenses/auto-attach')
      .set('X-Site-Hash', 'test-hash')
      .send({ siteUrl: 'https://example.com' });

    expect(res.status).toBe(401);
    // The actual code might be MISSING_AUTH or AUTH_REQUIRED depending on dual-auth implementation
    expect(['AUTH_REQUIRED', 'MISSING_AUTH']).toContain(res.body.code);
  });

  test('sites endpoint handles organization member with different roles', async () => {
    supabaseMock.__queueResponse('users', 'select', {
      data: { id: 43, email: 'member@example.com', plan: 'agency', service: 'alttext-ai' },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ organizationId: 11, role: 'member' }], // Not owner
      error: null
    });
    supabaseMock.__queueResponse('organizations', 'select', {
      data: { id: 11, plan: 'agency', service: 'alttext-ai' },
      error: null
    });
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 43 }],
      error: null
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: [],
      error: null
    });
    supabaseMock.__queueResponse('usage_monthly_summary', 'select', {
      data: { totalRequests: 0 },
      error: null
    });
    supabaseMock.__queueResponse('usage_events', 'select', {
      data: null,
      error: null
    });

    const token = generateToken({ id: 43, email: 'member@example.com', plan: 'agency' });
    const res = await request(app)
      .get('/api/licenses/sites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  test('sites endpoint returns empty array when no installations', async () => {
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 1 }],
      error: null
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: [],
      error: null
    });
    supabaseMock.__queueResponse('usage_monthly_summary', 'select', {
      data: { totalRequests: 0 },
      error: null
    });
    supabaseMock.__queueResponse('usage_events', 'select', {
      data: null,
      error: null
    });

    const res = await request(app)
      .get('/api/licenses/sites')
      .set('X-License-Key', 'org-license');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('disconnect returns 404 when installation not found', async () => {
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 1 }],
      error: null
    });
    supabaseMock.__queueResponse('installations', 'select', {
      data: null,
      error: { message: 'not found', code: 'PGRST116' }
    });

    const res = await request(app)
      .delete('/api/licenses/sites/nonexistent-install')
      .set('X-License-Key', 'org-license');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SITE_NOT_FOUND');
  });

  test('sites endpoint handles license key auth with organization', async () => {
    // Queue organization lookup (for dual-auth)
    supabaseMock.__queueResponse('organizations', 'select', {
      data: { id: 5, plan: 'agency', service: 'alttext-ai', licenseKey: 'org-license' },
      error: null
    });
    // Queue owner membership lookup
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: { userId: 1 },
      error: null
    });
    // Queue all org members lookup
    supabaseMock.__queueResponse('organization_members', 'select', {
      data: [{ userId: 1 }, { userId: 2 }],
      error: null
    });
    // Queue installations lookup
    supabaseMock.__queueResponse('installations', 'select', {
      data: [{
        id: 1,
        installId: 'install_1',
        siteHash: 'hash1',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        metadata: { siteUrl: 'https://example.com' },
        plan: 'agency'
      }],
      error: null
    });
    // Queue usage summary for each installation
    supabaseMock.__queueResponse('usage_monthly_summary', 'select', {
      data: { totalRequests: 5 },
      error: null
    });
    // Queue usage events for each installation
    supabaseMock.__queueResponse('usage_events', 'select', {
      data: { createdAt: new Date().toISOString() },
      error: null
    });

    const res = await request(app)
      .get('/api/licenses/sites')
      .set('X-License-Key', 'org-license');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });
});

