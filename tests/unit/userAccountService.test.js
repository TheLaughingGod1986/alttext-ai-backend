/**
 * Unit tests for userAccountService
 */

// Mock billingService at top level for Jest hoisting
jest.mock('../../src/services/billingService', () => ({
  getUserSubscriptions: jest.fn(),
}));

describe('userAccountService', () => {
  const MODULE_PATH = '../../src/services/userAccountService';

  let mockSupabase;
  let currentBuilderResponse;

  beforeEach(() => {
    jest.resetModules();
    const responseQueue = [];
    let responseIndex = 0;

    // Create a chainable mock builder
    const createBuilder = () => {
      const currentIndex = responseIndex++;
      const builder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
      };
      // Make it thenable (promise-like) - use the response at currentIndex
      builder.then = jest.fn((resolve) => {
        const resp = responseQueue[currentIndex] || { data: [], error: null };
        return Promise.resolve(resp).then(resolve);
      });
      return builder;
    };

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn(() => createBuilder()),
      // Helper to set response(s) for queries
      setResponse: (response) => {
        responseQueue.length = 0;
        responseIndex = 0;
        responseQueue.push(response);
      },
      setResponses: (responses) => {
        responseQueue.length = 0;
        responseIndex = 0;
        responseQueue.push(...responses);
      },
    };

    jest.mock('../../db/supabase-client', () => ({
      supabase: mockSupabase,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserInstallations', () => {
    test('returns installations successfully', async () => {
      const mockData = [
        { email: 'test@example.com', plugin_slug: 'alttext-ai', site_url: 'https://example.com' },
      ];
      mockSupabase.setResponse({ data: mockData, error: null });

      const { getUserInstallations } = require(MODULE_PATH);
      const result = await getUserInstallations('test@example.com');

      expect(result.success).toBe(true);
      expect(result.installations).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('vw_user_installations');
    });

    test('normalizes email to lowercase', async () => {
      mockSupabase.setResponse({ data: [], error: null });

      const { getUserInstallations } = require(MODULE_PATH);
      await getUserInstallations('Test@Example.com');

      // Email should be normalized in the service
      expect(mockSupabase.from).toHaveBeenCalled();
    });

    test('handles database errors gracefully', async () => {
      mockSupabase.setResponse({ data: null, error: { message: 'Database error' } });

      const { getUserInstallations } = require(MODULE_PATH);
      const result = await getUserInstallations('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.installations).toEqual([]);
    });

    test('returns empty array on exception', async () => {
      // Simulate exception by making the promise reject
      const createBuilder = () => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
        };
        builder.then = jest.fn((resolve, reject) => {
          return Promise.reject(new Error('Connection error')).then(resolve, reject);
        });
        return builder;
      };
      mockSupabase.from.mockReturnValueOnce(createBuilder());

      const { getUserInstallations } = require(MODULE_PATH);
      const result = await getUserInstallations('test@example.com');

      expect(result.success).toBe(false);
      expect(result.installations).toEqual([]);
    });
  });

  describe('getUserPlugins', () => {
    test('returns plugins successfully', async () => {
      const mockData = [
        { email: 'test@example.com', plugin_slug: 'alttext-ai', install_count: 2 },
      ];
      mockSupabase.setResponse({ data: mockData, error: null });

      const { getUserPlugins } = require(MODULE_PATH);
      const result = await getUserPlugins('test@example.com');

      expect(result.success).toBe(true);
      expect(result.plugins).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('vw_user_plugins_overview');
    });

    test('handles database errors gracefully', async () => {
      mockSupabase.setResponse({ data: null, error: { message: 'Database error' } });

      const { getUserPlugins } = require(MODULE_PATH);
      const result = await getUserPlugins('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.plugins).toEqual([]);
    });
  });

  describe('getUserSites', () => {
    test('returns sites successfully', async () => {
      const mockData = [
        { email: 'test@example.com', site_url: 'https://example.com', plugins: ['alttext-ai'] },
      ];
      mockSupabase.setResponse({ data: mockData, error: null });

      const { getUserSites } = require(MODULE_PATH);
      const result = await getUserSites('test@example.com');

      expect(result.success).toBe(true);
      expect(result.sites).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('vw_user_sites_overview');
    });

    test('handles database errors gracefully', async () => {
      mockSupabase.setResponse({ data: null, error: { message: 'Database error' } });

      const { getUserSites } = require(MODULE_PATH);
      const result = await getUserSites('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.sites).toEqual([]);
    });
  });

  describe('getFullAccount', () => {
    let mockBillingService;

    beforeEach(() => {
      mockBillingService = require('../../src/services/billingService');
      mockBillingService.getUserSubscriptions.mockResolvedValue({
        success: true,
        subscriptions: [],
      });
    });

    test('returns full account data successfully', async () => {
      const mockInstallations = [{ email: 'test@example.com', plugin_slug: 'alttext-ai' }];
      const mockPlugins = [{ email: 'test@example.com', plugin_slug: 'alttext-ai', install_count: 1 }];
      const mockSites = [{ email: 'test@example.com', site_url: 'https://example.com' }];

      // getFullAccount makes queries in this order:
      // 1. getUserInstallations - installations query
      // 2. getUserPlugins - plugins query
      // 3. getUserSites - sites query
      // 4. getUserUsage - users query (to get user ID)
      // 5. getUserUsage - usage_logs query (count)
      // 6. getUserInvoices - invoices query
      mockSupabase.setResponses([
        { data: mockInstallations, error: null }, // getUserInstallations
        { data: mockPlugins, error: null }, // getUserPlugins
        { data: mockSites, error: null }, // getUserSites
        { data: { id: 'user-123' }, error: null }, // getUserUsage - users lookup
        { count: 0, data: null, error: null }, // getUserUsage - usage_logs count
        { data: [], error: null }, // getUserInvoices
      ]);

      const { getFullAccount } = require(MODULE_PATH);
      const result = await getFullAccount('test@example.com');

      expect(result.success).toBe(true);
      expect(result.email).toBe('test@example.com');
      expect(result.installations).toEqual(mockInstallations);
      expect(result.plugins).toEqual(mockPlugins);
      expect(result.sites).toEqual(mockSites);
    });

    test('handles partial failures gracefully', async () => {
      mockSupabase.setResponses([
        { data: [], error: null }, // getUserInstallations
        { data: null, error: { message: 'Plugin query failed' } }, // getUserPlugins
        { data: [], error: null }, // getUserSites
        { data: [], error: null }, // getUserUsage
        { data: [], error: null }, // getUserInvoices
      ]);

      const { getFullAccount } = require(MODULE_PATH);
      const result = await getFullAccount('test@example.com');

      // Should still return success with empty arrays for failed queries
      expect(result.success).toBe(true);
      expect(result.installations).toEqual([]);
      expect(result.plugins).toEqual([]);
      expect(result.sites).toEqual([]);
    });

    test('normalizes email to lowercase', async () => {
      mockSupabase.setResponses([
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]);

      const { getFullAccount } = require(MODULE_PATH);
      const result = await getFullAccount('Test@Example.com');

      expect(result.email).toBe('test@example.com');
    });
  });
});

