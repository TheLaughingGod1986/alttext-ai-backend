/**
 * Integration tests for plugin authentication routes
 */

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');

// Mock services at top level for Jest hoisting
jest.mock('../../src/services/identityService', () => ({
  getOrCreateIdentity: jest.fn(),
  issueJwt: jest.fn(),
  refreshJwt: jest.fn(),
}));

jest.mock('../../src/services/pluginInstallationService', () => ({
  recordInstallation: jest.fn(),
}));

describe('Plugin Auth Routes', () => {
  let server;
  let mockIdentityService;
  let mockPluginInstallationService;

  beforeAll(() => {
    const { createTestServer } = require('../helpers/createTestServer');
    server = createTestServer();
    mockIdentityService = require('../../src/services/identityService');
    mockPluginInstallationService = require('../../src/services/pluginInstallationService');
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/plugin-init', () => {
    it('returns JWT when plugin-init succeeds', async () => {
      const identity = {
        id: 'identity-123',
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        site_url: 'https://example.com',
        jwt_version: 1,
      };

      mockIdentityService.getOrCreateIdentity.mockResolvedValue(identity);
      mockIdentityService.issueJwt.mockReturnValue('mock-jwt-token');
      mockPluginInstallationService.recordInstallation.mockResolvedValue({
        success: true,
      });

      const res = await request(server)
        .post('/auth/plugin-init')
        .send({
          email: 'test@example.com',
          plugin: 'alttext-ai',
          site: 'https://example.com',
          version: '1.0.0',
          wpVersion: '6.0',
          phpVersion: '8.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.token).toBe('mock-jwt-token');
      expect(res.body.email).toBe('test@example.com');
      expect(res.body.plugin).toBe('alttext-ai');
      expect(mockIdentityService.getOrCreateIdentity).toHaveBeenCalledWith(
        'test@example.com',
        'alttext-ai',
        'https://example.com'
      );
      expect(mockIdentityService.issueJwt).toHaveBeenCalledWith(identity);
    });

    it('creates identity if missing', async () => {
      const newIdentity = {
        id: 'identity-456',
        email: 'new@example.com',
        plugin_slug: 'alttext-ai',
        site_url: null,
        jwt_version: 1,
      };

      mockIdentityService.getOrCreateIdentity.mockResolvedValue(newIdentity);
      mockIdentityService.issueJwt.mockReturnValue('new-jwt-token');

      const res = await request(server)
        .post('/auth/plugin-init')
        .send({
          email: 'new@example.com',
          plugin: 'alttext-ai',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.token).toBe('new-jwt-token');
      expect(mockIdentityService.getOrCreateIdentity).toHaveBeenCalled();
    });

    it('records installation non-blocking', async () => {
      const identity = {
        id: 'identity-123',
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        jwt_version: 1,
      };

      mockIdentityService.getOrCreateIdentity.mockResolvedValue(identity);
      mockIdentityService.issueJwt.mockReturnValue('token');
      mockPluginInstallationService.recordInstallation.mockResolvedValue({
        success: true,
      });

      const res = await request(server)
        .post('/auth/plugin-init')
        .send({
          email: 'test@example.com',
          plugin: 'alttext-ai',
          site: 'https://example.com',
          version: '1.0.0',
        });

      expect(res.status).toBe(200);
      // Installation should be called (non-blocking, so we don't wait for it)
      expect(mockPluginInstallationService.recordInstallation).toHaveBeenCalled();
    });

    it('returns 400 for invalid email', async () => {
      const res = await request(server)
        .post('/auth/plugin-init')
        .send({
          email: 'invalid-email',
          plugin: 'alttext-ai',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing plugin', async () => {
      const res = await request(server)
        .post('/auth/plugin-init')
        .send({
          email: 'test@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 500 when identity creation fails', async () => {
      mockIdentityService.getOrCreateIdentity.mockResolvedValue(null);

      const res = await request(server)
        .post('/auth/plugin-init')
        .send({
          email: 'test@example.com',
          plugin: 'alttext-ai',
        });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('IDENTITY_CREATION_FAILED');
    });

    it('handles optional fields correctly', async () => {
      const identity = {
        id: 'identity-123',
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        jwt_version: 1,
      };

      mockIdentityService.getOrCreateIdentity.mockResolvedValue(identity);
      mockIdentityService.issueJwt.mockReturnValue('token');

      const res = await request(server)
        .post('/auth/plugin-init')
        .send({
          email: 'test@example.com',
          plugin: 'alttext-ai',
          site: '',
          version: '1.0.0',
          wpVersion: '6.0',
          phpVersion: '8.0',
          language: 'en',
          timezone: 'UTC',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /auth/refresh-token', () => {
    it('returns new JWT when refresh succeeds', async () => {
      mockIdentityService.refreshJwt.mockResolvedValue({
        success: true,
        token: 'new-jwt-token',
      });

      const res = await request(server)
        .post('/auth/refresh-token')
        .send({
          token: 'old-token',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.token).toBe('new-jwt-token');
      expect(mockIdentityService.refreshJwt).toHaveBeenCalledWith('old-token');
    });

    it('returns 401 when token is invalid', async () => {
      mockIdentityService.refreshJwt.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      const res = await request(server)
        .post('/auth/refresh-token')
        .send({
          token: 'invalid-token',
        });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns 401 when identity not found', async () => {
      mockIdentityService.refreshJwt.mockResolvedValue({
        success: false,
        error: 'IDENTITY_NOT_FOUND',
      });

      const res = await request(server)
        .post('/auth/refresh-token')
        .send({
          token: 'old-token',
        });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('IDENTITY_NOT_FOUND');
    });

    it('returns 401 when token version is invalid', async () => {
      mockIdentityService.refreshJwt.mockResolvedValue({
        success: false,
        error: 'TOKEN_VERSION_INVALID',
      });

      const res = await request(server)
        .post('/auth/refresh-token')
        .send({
          token: 'old-token',
        });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('TOKEN_VERSION_INVALID');
    });

    it('returns 400 when token is missing', async () => {
      const res = await request(server)
        .post('/auth/refresh-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('TOKEN_REQUIRED');
    });
  });

  describe('GET /auth/me', () => {
    it('returns ok: true', async () => {
      const res = await request(server).get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});

