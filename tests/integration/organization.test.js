/**
 * Integration tests for organization routes
 * Target: 80%+ coverage
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const supabaseMock = require('../mocks/supabase.mock');

// Helper to check success/ok in response (organization routes use 'ok', tests expect 'success')
function expectSuccess(response, expected = true) {
  if (response.body.ok !== undefined) {
    expect(response.body.ok).toBe(expected);
  } else if (response.body.success !== undefined) {
    expect(response.body.success).toBe(expected);
  } else {
    throw new Error('Response has neither ok nor success field');
  }
}

describe('Organization Routes', () => {
  let app;
  let authToken;
  let testUser;

  beforeEach(() => {
    // Reset mock FIRST - this clears the response queue
    // This is critical for test isolation - each test needs a clean mock state
    supabaseMock.__reset();
    
    // Create test user
    testUser = {
      id: 'test-user-id',
      email: 'test@example.com'
    };

    // Generate a real JWT token for testing
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    authToken = jwt.sign(
      {
        id: testUser.id,
        email: testUser.email,
        plan: 'free',
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  });

  afterEach(() => {
    // Reset mock after each test to ensure clean state for next test
    supabaseMock.__reset();
    jest.clearAllMocks();
  });

  describe('GET /api/organization/my-organizations', () => {
    test('should return 401 if not authenticated', async () => {
      const app = createTestServer();
      const response = await request(app)
        .get('/api/organization/my-organizations')
        .expect(401);

      // Response format may vary - check for either format
      if (response.body.success !== undefined) {
        expect(response.body.success).toBe(false);
      }
      if (response.body.error) {
        expect(response.body.error).toMatch(/Authentication|required|token/i);
      } else if (response.body.message) {
        expect(response.body.message).toMatch(/Authentication|required|token/i);
      }
    });

    test('should return empty array if user has no organizations', async () => {
      // Queue response BEFORE creating server to ensure mock state is ready
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [],
        error: null
      });

      // Create server AFTER queuing responses
      const app = createTestServer();
      
      const response = await request(app)
        .get('/api/organization/my-organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expectSuccess(response, true);
      expect(response.body.organizations).toEqual([]);
    });

    test('should return user organizations with sites and members', async () => {
      // Mock memberships - userId must match testUser.id from JWT token
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [
          { organizationId: 'org-1', role: 'owner', userId: testUser.id },
          { organizationId: 'org-2', role: 'member', userId: testUser.id }
        ],
        error: null
      });

      // Mock organizations
      supabaseMock.__queueResponse('organizations', 'select', {
        data: [
          { id: 'org-1', name: 'Org 1', plan: 'pro' },
          { id: 'org-2', name: 'Org 2', plan: 'agency' }
        ],
        error: null
      });

      // Mock sites
      supabaseMock.__queueResponse('sites', 'select', {
        data: [
          { organizationId: 'org-1', id: 'site-1' },
          { organizationId: 'org-1', id: 'site-2' }
        ],
        error: null
      });

      // Mock all members (second organization_members query - for all orgs)
      // This query gets all members for the organizations, not just the current user
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [
          { organizationId: 'org-1', userId: testUser.id, role: 'owner' },
          { organizationId: 'org-1', userId: 'user-2', role: 'member' },
          { organizationId: 'org-2', userId: testUser.id, role: 'member' }
        ],
        error: null
      });

      // Mock users - userIds are extracted from allMembers (testUser.id and 'user-2')
      supabaseMock.__queueResponse('users', 'select', {
        data: [
          { id: testUser.id, email: testUser.email },
          { id: 'user-2', email: 'user2@example.com' }
        ],
        error: null
      });

      // Create server AFTER queuing all responses to ensure mock state is ready
      // The mock queue persists across module reloads since it's in a separate module
      const app = createTestServer();
      
      const response = await request(app)
        .get('/api/organization/my-organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expectSuccess(response, true);
      expect(response.body.organizations).toHaveLength(2);
      // Sort organizations by id to ensure consistent ordering
      const sortedOrgs = response.body.organizations.sort((a, b) => a.id.localeCompare(b.id));
      // Find org-1 (should have 2 sites and 2 members)
      const org1 = sortedOrgs.find(org => org.id === 'org-1');
      expect(org1).toBeDefined();
      expect(org1.activeSites).toBe(2);
      expect(org1.members).toHaveLength(2);
    });

    test('should handle database errors gracefully', async () => {
      // Queue response BEFORE creating server to ensure mock state is ready
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: null,
        error: { message: 'Database error' }
      });

      // Create server AFTER queuing responses
      const app = createTestServer();
      
      const response = await request(app)
        .get('/api/organization/my-organizations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      // Organization routes use 'ok' or standardized error format
      if (response.body.success !== undefined) {
        expect(response.body.success).toBe(false);
      } else if (response.body.ok !== undefined) {
        expect(response.body.ok).toBe(false);
      }
      if (response.body.error) {
        expect(response.body.error).toMatch(/Failed|error/i);
      } else if (response.body.message) {
        expect(response.body.message).toMatch(/Failed|error/i);
      }
    });
  });

  describe('GET /api/organization/:orgId/sites', () => {
    test('should return 401 if not authenticated', async () => {
      const app = createTestServer();
      const response = await request(app)
        .get('/api/organization/1/sites')
        .expect(401);

      // Response format may vary - check for either format
      if (response.body.success !== undefined) {
        expect(response.body.success).toBe(false);
      }
      if (response.body.error) {
        expect(response.body.error).toMatch(/Authentication|required|token/i);
      } else if (response.body.message) {
        expect(response.body.message).toMatch(/Authentication|required|token/i);
      }
    });

    test('should return 403 if user is not a member', async () => {
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: null,
        error: { code: 'PGRST116' } // Not found
      });

      const app = createTestServer();
      const response = await request(app)
        .get('/api/organization/1/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('access');
    });

    test('should return sites for organization', async () => {
      // Mock membership check
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { id: 'membership-1' },
        error: null
      });

      // Mock sites
      supabaseMock.__queueResponse('sites', 'select', {
        data: [
          {
            id: 'site-1',
            siteUrl: 'https://example.com',
            siteHash: 'hash-1',
            isActive: true,
            firstSeen: '2024-01-01',
            lastSeen: '2024-01-02',
            pluginVersion: '1.0.0',
            wordpressVersion: '6.0',
            phpVersion: '8.0',
            isMultisite: false
          }
        ],
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .get('/api/organization/1/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sites).toHaveLength(1);
      expect(response.body.sites[0]).toHaveProperty('siteUrl');
      expect(response.body.sites[0]).toHaveProperty('siteHash');
    });
  });

  describe('GET /api/organization/:orgId/usage', () => {
    test('should return usage statistics', async () => {
      // Mock membership check
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { id: 'membership-1' },
        error: null
      });

      // Mock organization
      supabaseMock.__queueResponse('organizations', 'select', {
        data: {
          id: 'org-1',
          tokens_remaining: 1000,
          reset_date: '2024-01-01',
          plan: 'pro'
        },
        error: null
      });

      // Mock usage logs
      supabaseMock.__queueResponse('usage_logs', 'select', {
        data: [
          { used: 10, createdAt: '2024-01-02T10:00:00Z', imageId: 'img-1' },
          { used: 20, createdAt: '2024-01-02T11:00:00Z', imageId: 'img-2' }
        ],
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .get('/api/organization/1/usage')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.usage).toHaveProperty('tokensRemaining');
      expect(response.body.usage).toHaveProperty('tokensUsed');
      expect(response.body.usage.tokensUsed).toBe(30);
      expect(response.body.usage).toHaveProperty('dailyUsage');
    });
  });

  describe('POST /api/organization/:orgId/invite', () => {
    test('should return 403 if user is not owner or admin', async () => {
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'member' },
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .post('/api/organization/1/invite')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'new@example.com', role: 'member' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('owners and admins');
    });

    test('should invite user to organization', async () => {
      // Mock membership check (owner)
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'owner' },
        error: null
      });

      // Mock user lookup
      supabaseMock.__queueResponse('users', 'select', {
        data: { id: 'new-user-id' },
        error: null
      });

      // Mock existing membership check (not found)
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: null,
        error: { code: 'PGRST116' }
      });

      // Mock insert
      supabaseMock.__queueResponse('organization_members', 'insert', {
        data: { id: 'new-membership' },
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .post('/api/organization/1/invite')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'new@example.com', role: 'member' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('added');
    });

    test('should return 404 if user not found', async () => {
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'owner' },
        error: null
      });

      supabaseMock.__queueResponse('users', 'select', {
        data: null,
        error: { code: 'PGRST116' }
      });

      const app = createTestServer();
      const response = await request(app)
        .post('/api/organization/1/invite')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'nonexistent@example.com', role: 'member' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    test('should return 400 if user already a member', async () => {
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'owner' },
        error: null
      });

      supabaseMock.__queueResponse('users', 'select', {
        data: { id: 'existing-user-id' },
        error: null
      });

      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { id: 'existing-membership' },
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .post('/api/organization/1/invite')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'existing@example.com', role: 'member' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already a member');
    });
  });

  describe('DELETE /api/organization/:orgId/members/:userId', () => {
    test('should remove member from organization', async () => {
      // Mock membership check (admin)
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'admin' },
        error: null
      });

      // Mock member to remove check (not owner)
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'member' },
        error: null
      });

      // Mock delete
      supabaseMock.__queueResponse('organization_members', 'delete', {
        data: null,
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .delete('/api/organization/1/members/2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('removed');
    });

    test('should return 403 if trying to remove owner', async () => {
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'admin' },
        error: null
      });

      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { role: 'owner' },
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .delete('/api/organization/1/members/2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('owner');
    });
  });

  describe('GET /api/organization/:orgId/members', () => {
    test('should return all members of organization', async () => {
      // Mock membership check
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: { id: 'membership-1' },
        error: null
      });

      // Mock members
      supabaseMock.__queueResponse('organization_members', 'select', {
        data: [
          { userId: 'user-1', role: 'owner', createdAt: '2024-01-01' },
          { userId: 'user-2', role: 'member', createdAt: '2024-01-02' }
        ],
        error: null
      });

      // Mock users
      supabaseMock.__queueResponse('users', 'select', {
        data: [
          { id: 'user-1', email: 'user1@example.com', createdAt: '2024-01-01' },
          { id: 'user-2', email: 'user2@example.com', createdAt: '2024-01-02' }
        ],
        error: null
      });

      const app = createTestServer();
      const response = await request(app)
        .get('/api/organization/1/members')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.members).toHaveLength(2);
      expect(response.body.members[0]).toHaveProperty('email');
      expect(response.body.members[0]).toHaveProperty('role');
    });
  });
});


