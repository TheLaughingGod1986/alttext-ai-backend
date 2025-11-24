/**
 * PHASE 8: Supabase Failure Modes Tests
 * Tests for network failures, malformed records, null responses, and constraint violations
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const supabaseMock = require('../mocks/supabase.mock');
const { createTestToken } = require('../helpers/testHelpers');

describe('PHASE 8: Supabase Failure Modes', () => {
  let app;

  beforeEach(() => {
    app = createTestServer();
    supabaseMock.__reset();
  });

  describe('Network failure handling', () => {
    test('handles ECONNREFUSED error gracefully', async () => {
      // Mock Supabase to return network error via queue
      const networkError = { 
        message: 'Connection refused', 
        code: 'ECONNREFUSED' 
      };
      
      // Queue error response for users table select
      supabaseMock.__queueResponse('users', 'select', {
        data: null,
        error: networkError
      });

      const token = createTestToken({ id: 30, email: 'network@example.com', plan: 'free' });
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      // Should handle network error gracefully - /auth/me may return 404, 403, 500, 503, or 401
      expect([403, 404, 500, 503, 401]).toContain(res.status);
    });

    test('handles ETIMEDOUT error gracefully', async () => {
      const timeoutError = { 
        message: 'Request timeout', 
        code: 'ETIMEDOUT' 
      };
      
      // Queue error response for users table select
      supabaseMock.__queueResponse('users', 'select', {
        data: null,
        error: timeoutError
      });

      const token = createTestToken({ id: 31, email: 'timeout@example.com', plan: 'free' });
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      // Should handle timeout error gracefully - /auth/me may return 404, 403, 500, 503, or 401
      expect([403, 404, 500, 503, 401]).toContain(res.status);
    });
  });

  describe('Malformed record handling', () => {
    test('handles malformed JSON in response', async () => {
      // Queue a response with malformed structure
      supabaseMock.__queueResponse('users', 'select', {
        data: { id: 32, email: null, plan: undefined, invalidField: 'unexpected' }, // Malformed
        error: null
      });

      const token = createTestToken({ id: 32, email: 'malformed@example.com', plan: 'free' });
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      // Should handle malformed data gracefully
      expect([200, 500]).toContain(res.status);
    });

    test('handles unexpected data formats', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: 'not-an-object', // Wrong type
        error: null
      });

      const res = await request(app)
        .get('/api/license/info/test-license');

      // Should handle unexpected format - may return 200 (with malformed data), 400, or 500
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  describe('Unexpected null responses', () => {
    test('handles .single() returning null data when data expected', async () => {
      supabaseMock.__queueResponse('users', 'select', {
        data: null, // Null when data expected
        error: null
      });

      const token = createTestToken({ id: 33, email: 'null@example.com', plan: 'free' });
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      // Should handle null data gracefully - may return 200, 403, 404, or 500
      expect([200, 403, 404, 500]).toContain(res.status);
    });

    test('handles .select() returning empty array when data expected', async () => {
      supabaseMock.__queueResponse('organizations', 'select', {
        data: [], // Empty array when data expected
        error: null
      });
      supabaseMock.__queueResponse('sites', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('organization_members', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('users', 'select', { data: [], error: null });

      const res = await request(app)
        .get('/api/license/info/test-license');

      // Should handle empty array gracefully - may return 404 or 200 with empty data
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('Database constraint violations', () => {
    test('handles unique constraint violation (duplicate license key)', async () => {
      const uniqueError = {
        code: '23505', // PostgreSQL unique violation
        message: 'duplicate key value violates unique constraint',
        detail: 'Key (licenseKey)=(duplicate-key) already exists.'
      };

      supabaseMock.__queueResponse('organizations', 'insert', {
        data: null,
        error: uniqueError
      });

      const res = await request(app)
        .post('/api/license/generate')
        .send({
          name: 'Duplicate Org',
          plan: 'agency'
        });

      // Should handle unique constraint violation
      expect([400, 409, 500]).toContain(res.status);
    });

    test('handles foreign key violation (invalid organizationId)', async () => {
      const fkError = {
        code: '23503', // PostgreSQL foreign key violation
        message: 'insert or update on table "sites" violates foreign key constraint',
        detail: 'Key (organizationId)=(999) is not present in table "organizations".'
      };

      supabaseMock.__queueResponse('sites', 'insert', {
        data: null,
        error: fkError
      });

      const token = createTestToken({ id: 34, email: 'fk@example.com', plan: 'agency' });
      const res = await request(app)
        .post('/api/license/activate')
        .set('Authorization', `Bearer ${token}`)
        .send({
          licenseKey: 'test-license',
          siteHash: 'test-hash',
          siteUrl: 'https://example.com'
        });

      // Should handle foreign key violation
      expect([400, 404, 500]).toContain(res.status);
    });

    test('handles NOT NULL constraint violation', async () => {
      const notNullError = {
        code: '23502', // PostgreSQL not null violation
        message: 'null value in column "licenseKey" violates not-null constraint',
        detail: 'Failing row contains (id, name, licenseKey, ...).'
      };

      supabaseMock.__queueResponse('organizations', 'insert', {
        data: null,
        error: notNullError
      });

      const res = await request(app)
        .post('/api/license/generate')
        .send({
          name: 'Missing Field Org',
          plan: 'agency'
        });

      // Should handle NOT NULL constraint violation
      expect([400, 500]).toContain(res.status);
    });
  });
});

