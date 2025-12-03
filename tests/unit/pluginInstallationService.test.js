/**
 * Unit tests for pluginInstallationService
 */

describe('pluginInstallationService', () => {
  const MODULE_PATH = '../../src/services/pluginInstallationService';

  let mockSupabase;
  let mockFromResult;
  let mockSelectChain;
  let mockInsertChain;
  let mockUpdateChain;

  beforeEach(() => {
    jest.resetModules();

    // Mock the query chain methods
    mockSelectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    mockInsertChain = {
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: '123' }, error: null }),
    };

    mockUpdateChain = {
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: '123' }, error: null }),
    };

    // Create a mock object that from() returns, which has select(), insert(), update()
    mockFromResult = {
      select: jest.fn().mockReturnValue(mockSelectChain),
      insert: jest.fn().mockReturnValue(mockInsertChain),
      update: jest.fn().mockReturnValue(mockUpdateChain),
    };

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnValue(mockFromResult),
    };

    jest.mock('../../db/supabase-client', () => ({
      supabase: mockSupabase,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordInstallation', () => {
    test('records installation successfully', async () => {
      // Mock no existing installation (new record)
      mockSelectChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });
      // Mock successful insert
      mockInsertChain.single.mockResolvedValue({
        data: { id: '123', email: 'test@example.com', plugin_slug: 'beepbeep-ai' },
        error: null,
      });

      const { recordInstallation } = require(MODULE_PATH);
      const result = await recordInstallation({
        email: 'test@example.com',
        plugin: 'beepbeep-ai',
        site: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.record.id).toBe('123');
      expect(mockSupabase.from).toHaveBeenCalledWith('plugin_installations');
      expect(mockFromResult.insert).toHaveBeenCalled();
    });

    test('handles database errors gracefully', async () => {
      // Mock no existing installation
      mockSelectChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });
      // Mock insert error
      mockInsertChain.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const { recordInstallation } = require(MODULE_PATH);
      const result = await recordInstallation({
        email: 'test@example.com',
        plugin: 'beepbeep-ai',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    test('normalizes email to lowercase', async () => {
      // Mock no existing installation
      mockSelectChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });
      // Mock successful insert
      mockInsertChain.single.mockResolvedValue({
        data: { id: '123' },
        error: null,
      });

      const { recordInstallation } = require(MODULE_PATH);
      await recordInstallation({
        email: 'Test@Example.com',
        plugin: 'beepbeep-ai',
      });

      expect(mockFromResult.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
        })
      );
    });

    test('handles optional fields correctly', async () => {
      // Mock no existing installation
      mockSelectChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });
      // Mock successful insert
      mockInsertChain.single.mockResolvedValue({
        data: { id: '123' },
        error: null,
      });

      const { recordInstallation } = require(MODULE_PATH);
      await recordInstallation({
        email: 'test@example.com',
        plugin: 'beepbeep-ai',
        // No optional fields
      });

      expect(mockFromResult.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          site_url: null,
          version: null,
          wp_version: null,
          php_version: null,
          language: null,
          timezone: null,
          install_source: 'plugin',
        })
      );
    });

    test('includes all metadata fields when provided', async () => {
      // Mock no existing installation
      mockSelectChain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });
      // Mock successful insert
      mockInsertChain.single.mockResolvedValue({
        data: { id: '123' },
        error: null,
      });

      const { recordInstallation } = require(MODULE_PATH);
      await recordInstallation({
        email: 'test@example.com',
        plugin: 'beepbeep-ai',
        site: 'https://example.com',
        version: '1.0.0',
        wpVersion: '6.0',
        phpVersion: '8.0',
        language: 'en_US',
        timezone: 'America/New_York',
        installSource: 'website',
      });

      expect(mockFromResult.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          plugin_slug: 'beepbeep-ai',
          site_url: 'https://example.com',
          version: '1.0.0',
          wp_version: '6.0',
          php_version: '8.0',
          language: 'en_US',
          timezone: 'America/New_York',
          install_source: 'website',
        })
      );
    });

    test('handles exceptions gracefully', async () => {
      // Mock lookup throwing an error
      mockSelectChain.maybeSingle.mockRejectedValue(new Error('Unexpected error'));

      const { recordInstallation } = require(MODULE_PATH);
      const result = await recordInstallation({
        email: 'test@example.com',
        plugin: 'beepbeep-ai',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected error');
    });
  });
});

