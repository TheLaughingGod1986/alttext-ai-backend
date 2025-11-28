/**
 * Unit tests for identityService
 */

jest.mock('../../db/supabase-client');
jest.mock('../../src/services/billingService');
jest.mock('../../src/services/usageService');
jest.mock('jsonwebtoken');

const identityService = require('../../src/services/identityService');
const { supabase } = require('../../db/supabase-client');
const billingService = require('../../src/services/billingService');
const usageService = require('../../src/services/usageService');
const jwt = require('jsonwebtoken');

describe('identityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '12h';
  });

  describe('getOrCreateIdentity', () => {
    it('should return existing identity if found', async () => {
      const existingIdentity = {
        id: 'identity-123',
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        site_url: 'https://example.com',
        jwt_version: 1,
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: existingIdentity,
          error: null,
        }),
      });

      const result = await identityService.getOrCreateIdentity(
        'test@example.com',
        'alttext-ai',
        'https://example.com'
      );

      expect(result).toEqual(existingIdentity);
      expect(supabase.from).toHaveBeenCalledWith('plugin_identities');
    });

    it('should create new identity if not found', async () => {
      const newIdentity = {
        id: 'identity-456',
        email: 'new@example.com',
        plugin_slug: 'alttext-ai',
        site_url: 'https://newsite.com',
        jwt_version: 1,
      };

      // First call - not found
      supabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }, // Not found
        }),
      });

      // Second call - insert
      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: newIdentity,
          error: null,
        }),
      });

      const result = await identityService.getOrCreateIdentity(
        'new@example.com',
        'alttext-ai',
        'https://newsite.com'
      );

      expect(result).toEqual(newIdentity);
    });

    it('should return null on insert error', async () => {
      // First call - not found
      supabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      // Second call - insert fails
      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Insert failed' },
        }),
      });

      const result = await identityService.getOrCreateIdentity(
        'error@example.com',
        'alttext-ai',
        'https://example.com'
      );

      expect(result).toBeNull();
    });

    it('should handle null site URL', async () => {
      const newIdentity = {
        id: 'identity-789',
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        site_url: null,
        jwt_version: 1,
      };

      supabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: newIdentity,
          error: null,
        }),
      });

      const result = await identityService.getOrCreateIdentity(
        'test@example.com',
        'alttext-ai',
        null
      );

      expect(result).toEqual(newIdentity);
    });
  });

  describe('issueJwt', () => {
    it('should issue JWT with correct payload', () => {
      const identity = {
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        jwt_version: 1,
      };

      jwt.sign.mockReturnValue('mock-jwt-token');

      const token = identityService.issueJwt(identity);

      expect(token).toBe('mock-jwt-token');
      expect(jwt.sign).toHaveBeenCalledWith(
        {
          email: 'test@example.com',
          plugin: 'alttext-ai',
          version: 1,
        },
        'test-secret',
        { expiresIn: '12h' }
      );
    });
  });

  describe('refreshJwt', () => {
    it('should return new token when old token is valid', async () => {
      const decoded = {
        email: 'test@example.com',
        plugin: 'alttext-ai',
        version: 1,
      };

      const identity = {
        id: 'identity-123',
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        jwt_version: 1,
      };

      jwt.verify.mockReturnValue(decoded);
      jwt.sign.mockReturnValue('new-jwt-token');

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: identity,
          error: null,
        }),
      });

      const result = await identityService.refreshJwt('old-token');

      expect(result.success).toBe(true);
      expect(result.token).toBe('new-jwt-token');
    });

    it('should return error when identity not found', async () => {
      const decoded = {
        email: 'test@example.com',
        plugin: 'alttext-ai',
        version: 1,
      };

      jwt.verify.mockReturnValue(decoded);

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      });

      const result = await identityService.refreshJwt('old-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('IDENTITY_NOT_FOUND');
    });

    it('should return error when version mismatch', async () => {
      const decoded = {
        email: 'test@example.com',
        plugin: 'alttext-ai',
        version: 1, // Old version
      };

      const identity = {
        id: 'identity-123',
        email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        jwt_version: 2, // New version
      };

      jwt.verify.mockReturnValue(decoded);

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: identity,
          error: null,
        }),
      });

      const result = await identityService.refreshJwt('old-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('TOKEN_VERSION_INVALID');
    });

    it('should return error when token is invalid', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await identityService.refreshJwt('invalid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });

  describe('getIdentityDashboard', () => {
    it('should return aggregated dashboard data', async () => {
      const installations = [
        {
          id: 'install-1',
          email: 'test@example.com',
          plugin_slug: 'alttext-ai',
          site_url: 'https://example.com',
        },
      ];

      const subscription = {
        id: 'sub-123',
        user_email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        plan: 'pro',
        status: 'active',
      };

      const usageSummary = {
        success: true,
        usage: {
          monthlyImages: 10,
          dailyImages: 2,
          totalImages: 50,
        },
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({
          data: installations,
          error: null,
        }),
      });

      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: [subscription],
      });

      usageService.getUsageSummary.mockResolvedValue(usageSummary);

      const result = await identityService.getIdentityDashboard('test@example.com');

      expect(result.installations).toEqual(installations);
      expect(result.subscription).toEqual(subscription);
      expect(result.usage).toEqual(usageSummary.usage);
    });

    it('should handle missing subscription', async () => {
      const installations = [];
      const usageSummary = {
        success: true,
        usage: {},
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({
          data: installations,
          error: null,
        }),
      });

      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: [],
      });

      usageService.getUsageSummary.mockResolvedValue(usageSummary);

      const result = await identityService.getIdentityDashboard('test@example.com');

      expect(result.installations).toEqual([]);
      expect(result.subscription).toBeNull();
      expect(result.usage).toEqual({});
    });

    it('should handle missing installations', async () => {
      const subscription = {
        id: 'sub-123',
        user_email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        plan: 'pro',
        status: 'active',
      };

      const usageSummary = {
        success: true,
        usage: {
          monthlyImages: 5,
        },
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      billingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: [subscription],
      });

      usageService.getUsageSummary.mockResolvedValue(usageSummary);

      const result = await identityService.getIdentityDashboard('test@example.com');

      expect(result.installations).toEqual([]);
      expect(result.subscription).toEqual(subscription);
      expect(result.usage).toEqual(usageSummary.usage);
    });
  });
});

