/**
 * Unit tests for emailEventService
 */

describe('emailEventService', () => {
  const MODULE_PATH = '../../src/services/emailEventService';

  let mockSupabase;

  beforeEach(() => {
    jest.resetModules();

    // Mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      single: jest.fn(),
    };

    jest.mock('../../db/supabase-client', () => ({
      supabase: mockSupabase,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hasRecentEvent', () => {
    test('returns true when recent event exists', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [{ id: 'event_123' }],
        error: null,
      });

      const { hasRecentEvent } = require(MODULE_PATH);
      const result = await hasRecentEvent({
        email: 'test@example.com',
        eventType: 'waitlist_signup',
        windowMinutes: 60,
      });

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('email_events');
      expect(mockSupabase.eq).toHaveBeenCalledWith('email', 'test@example.com');
      expect(mockSupabase.eq).toHaveBeenCalledWith('event_type', 'waitlist_signup');
    });

    test('returns false when no recent event exists', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [],
        error: null,
      });

      const { hasRecentEvent } = require(MODULE_PATH);
      const result = await hasRecentEvent({
        email: 'test@example.com',
        eventType: 'waitlist_signup',
        windowMinutes: 60,
      });

      expect(result).toBe(false);
    });

    test('returns false on database error (fail-safe)', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const { hasRecentEvent } = require(MODULE_PATH);
      const result = await hasRecentEvent({
        email: 'test@example.com',
        eventType: 'waitlist_signup',
      });

      expect(result).toBe(false);
    });

    test('uses default windowMinutes of 60', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [],
        error: null,
      });

      const { hasRecentEvent } = require(MODULE_PATH);
      await hasRecentEvent({
        email: 'test@example.com',
        eventType: 'waitlist_signup',
      });

      // Verify gte was called with a date (windowMinutes default)
      expect(mockSupabase.gte).toHaveBeenCalled();
    });
  });

  describe('hasRecentEventForPlugin', () => {
    test('returns true when recent event exists for email+plugin', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [{ id: 'event_123' }],
        error: null,
      });

      const { hasRecentEventForPlugin } = require(MODULE_PATH);
      const result = await hasRecentEventForPlugin({
        email: 'test@example.com',
        pluginSlug: 'AltText AI',
        eventType: 'plugin_signup',
        windowMinutes: 10,
      });

      expect(result).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('email_events');
      expect(mockSupabase.eq).toHaveBeenCalledWith('email', 'test@example.com');
      expect(mockSupabase.eq).toHaveBeenCalledWith('plugin_slug', 'AltText AI');
      expect(mockSupabase.eq).toHaveBeenCalledWith('event_type', 'plugin_signup');
    });

    test('returns false when no recent event exists', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [],
        error: null,
      });

      const { hasRecentEventForPlugin } = require(MODULE_PATH);
      const result = await hasRecentEventForPlugin({
        email: 'test@example.com',
        pluginSlug: 'AltText AI',
        eventType: 'plugin_signup',
        windowMinutes: 10,
      });

      expect(result).toBe(false);
    });

    test('returns false on database error (fail-safe)', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const { hasRecentEventForPlugin } = require(MODULE_PATH);
      const result = await hasRecentEventForPlugin({
        email: 'test@example.com',
        pluginSlug: 'AltText AI',
        eventType: 'plugin_signup',
      });

      expect(result).toBe(false);
    });

    test('uses default windowMinutes of 10', async () => {
      mockSupabase.limit.mockResolvedValue({
        data: [],
        error: null,
      });

      const { hasRecentEventForPlugin } = require(MODULE_PATH);
      await hasRecentEventForPlugin({
        email: 'test@example.com',
        pluginSlug: 'AltText AI',
        eventType: 'plugin_signup',
      });

      // Verify gte was called with a date (windowMinutes default)
      expect(mockSupabase.gte).toHaveBeenCalled();
    });
  });

  describe('logEvent', () => {
    test('logs event successfully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 'event_123' },
        error: null,
      });

      const { logEvent } = require(MODULE_PATH);
      const result = await logEvent({
        email: 'test@example.com',
        eventType: 'plugin_signup',
        pluginSlug: 'AltText AI',
        context: { siteUrl: 'https://example.com' },
        success: true,
        emailId: 'email_123',
      });

      expect(result.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('email_events');
      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    test('handles database errors gracefully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const { logEvent } = require(MODULE_PATH);
      const result = await logEvent({
        email: 'test@example.com',
        eventType: 'plugin_signup',
        success: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    test('normalizes email to lowercase', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 'event_123' },
        error: null,
      });

      const { logEvent } = require(MODULE_PATH);
      await logEvent({
        email: 'Test@Example.com',
        eventType: 'plugin_signup',
        success: true,
      });

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
        })
      );
    });
  });
});

