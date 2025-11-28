/**
 * Unit tests for userAccountService
 */

describe('userAccountService', () => {
  const MODULE_PATH = '../../src/services/userAccountService';

  let mockSupabase;

  beforeEach(() => {
    jest.resetModules();

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
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
      mockSupabase.eq.mockResolvedValue({ data: mockData, error: null });

      const { getUserInstallations } = require(MODULE_PATH);
      const result = await getUserInstallations('test@example.com');

      expect(result.success).toBe(true);
      expect(result.installations).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('vw_user_installations');
      expect(mockSupabase.select).toHaveBeenCalledWith('*');
      expect(mockSupabase.eq).toHaveBeenCalledWith('email', 'test@example.com');
    });

    test('normalizes email to lowercase', async () => {
      mockSupabase.eq.mockResolvedValue({ data: [], error: null });

      const { getUserInstallations } = require(MODULE_PATH);
      await getUserInstallations('Test@Example.com');

      expect(mockSupabase.eq).toHaveBeenCalledWith('email', 'test@example.com');
    });

    test('handles database errors gracefully', async () => {
      mockSupabase.eq.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      const { getUserInstallations } = require(MODULE_PATH);
      const result = await getUserInstallations('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.installations).toEqual([]);
    });

    test('returns empty array on exception', async () => {
      mockSupabase.eq.mockRejectedValue(new Error('Connection error'));

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
      mockSupabase.eq.mockResolvedValue({ data: mockData, error: null });

      const { getUserPlugins } = require(MODULE_PATH);
      const result = await getUserPlugins('test@example.com');

      expect(result.success).toBe(true);
      expect(result.plugins).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('vw_user_plugins_overview');
    });

    test('handles database errors gracefully', async () => {
      mockSupabase.eq.mockResolvedValue({ data: null, error: { message: 'Database error' } });

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
      mockSupabase.eq.mockResolvedValue({ data: mockData, error: null });

      const { getUserSites } = require(MODULE_PATH);
      const result = await getUserSites('test@example.com');

      expect(result.success).toBe(true);
      expect(result.sites).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('vw_user_sites_overview');
    });

    test('handles database errors gracefully', async () => {
      mockSupabase.eq.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      const { getUserSites } = require(MODULE_PATH);
      const result = await getUserSites('test@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(result.sites).toEqual([]);
    });
  });

  describe('getFullAccount', () => {
    test('returns full account data successfully', async () => {
      const mockInstallations = [{ email: 'test@example.com', plugin_slug: 'alttext-ai' }];
      const mockPlugins = [{ email: 'test@example.com', plugin_slug: 'alttext-ai', install_count: 1 }];
      const mockSites = [{ email: 'test@example.com', site_url: 'https://example.com' }];

      // Mock all three queries
      let callCount = 0;
      mockSupabase.eq.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ data: mockInstallations, error: null });
        } else if (callCount === 2) {
          return Promise.resolve({ data: mockPlugins, error: null });
        } else {
          return Promise.resolve({ data: mockSites, error: null });
        }
      });

      const { getFullAccount } = require(MODULE_PATH);
      const result = await getFullAccount('test@example.com');

      expect(result.success).toBe(true);
      expect(result.email).toBe('test@example.com');
      expect(result.installations).toEqual(mockInstallations);
      expect(result.plugins).toEqual(mockPlugins);
      expect(result.sites).toEqual(mockSites);
    });

    test('handles partial failures gracefully', async () => {
      let callCount = 0;
      mockSupabase.eq.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ data: [], error: null });
        } else if (callCount === 2) {
          return Promise.resolve({ data: null, error: { message: 'Plugin query failed' } });
        } else {
          return Promise.resolve({ data: [], error: null });
        }
      });

      const { getFullAccount } = require(MODULE_PATH);
      const result = await getFullAccount('test@example.com');

      // Should still return success with empty arrays for failed queries
      expect(result.success).toBe(true);
      expect(result.installations).toEqual([]);
      expect(result.plugins).toEqual([]);
      expect(result.sites).toEqual([]);
    });

    test('normalizes email to lowercase', async () => {
      mockSupabase.eq.mockResolvedValue({ data: [], error: null });

      const { getFullAccount } = require(MODULE_PATH);
      const result = await getFullAccount('Test@Example.com');

      expect(result.email).toBe('test@example.com');
    });
  });
});

