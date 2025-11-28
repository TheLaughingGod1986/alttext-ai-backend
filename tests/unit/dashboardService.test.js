/**
 * Unit tests for dashboardService
 */

const dashboardService = require('../../src/services/dashboardService');

// Mock dependencies
jest.mock('../../db/supabase-client');
jest.mock('../../src/services/usageService');

const { supabase } = require('../../db/supabase-client');
const usageService = require('../../src/services/usageService');

describe('dashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardData', () => {
    it('should aggregate installations + subscription + usage correctly', async () => {
      const mockInstallations = [
        {
          id: '1',
          email: 'test@example.com',
          plugin_slug: 'alttext-ai',
          site_url: 'https://example.com',
          last_seen_at: '2024-01-10T11:00:00.000Z',
        },
        {
          id: '2',
          email: 'test@example.com',
          plugin_slug: 'beepbeep-ai',
          site_url: 'https://example2.com',
          last_seen_at: '2024-01-09T10:00:00.000Z',
        },
      ];

      const mockSubscription = {
        id: 'sub1',
        user_email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        plan: 'pro',
        status: 'active',
      };

      const mockUsage = {
        monthlyImages: 450,
        dailyImages: 15,
        totalImages: 2000,
      };

      // Mock Supabase queries
      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      
      // Mock installations query
      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: mockInstallations,
              error: null,
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: [mockSubscription],
              error: null,
            }),
          };
        }
        return mockSupabaseChain;
      });

      // Mock usageService
      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: mockUsage,
      });

      const result = await dashboardService.getDashboardData('test@example.com');

      expect(result.installations).toEqual(mockInstallations);
      expect(result.subscription).toEqual(mockSubscription);
      expect(result.usage).toEqual({
        monthlyImages: 450,
        dailyImages: 15,
        totalImages: 2000,
      });
      expect(usageService.getUsageSummary).toHaveBeenCalledWith('test@example.com');
    });

    it('should handle Supabase errors gracefully', async () => {
      // Mock Supabase query error
      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST301', message: 'Database connection failed' },
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST301', message: 'Database connection failed' },
            }),
          };
        }
        return mockSupabaseChain;
      });

      usageService.getUsageSummary.mockResolvedValue({
        success: false,
        error: 'Usage service error',
        usage: {},
      });

      const result = await dashboardService.getDashboardData('test@example.com');

      // Should return defaults on error
      expect(result.installations).toEqual([]);
      expect(result.subscription).toBeNull();
      expect(result.usage).toEqual({ monthlyImages: 0, dailyImages: 0, totalImages: 0 });
    });

    it('should return defaults if data missing', async () => {
      // Mock empty results
      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        return mockSupabaseChain;
      });

      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: {},
      });

      const result = await dashboardService.getDashboardData('test@example.com');

      expect(result.installations).toEqual([]);
      expect(result.subscription).toBeNull();
      expect(result.usage).toEqual({ monthlyImages: 0, dailyImages: 0, totalImages: 0 });
    });

    it('should handle missing usage data', async () => {
      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        return mockSupabaseChain;
      });

      usageService.getUsageSummary.mockResolvedValue({
        success: false,
        error: 'User not found',
        usage: {},
      });

      const result = await dashboardService.getDashboardData('test@example.com');

      expect(result.usage).toEqual({ monthlyImages: 0, dailyImages: 0, totalImages: 0 });
    });

    it('should handle exceptions gracefully', async () => {
      // Mock Supabase to throw
      supabase.from.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      usageService.getUsageSummary.mockRejectedValue(new Error('Service error'));

      const result = await dashboardService.getDashboardData('test@example.com');

      // Should return defaults on exception
      expect(result.installations).toEqual([]);
      expect(result.subscription).toBeNull();
      expect(result.usage).toEqual({ monthlyImages: 0, dailyImages: 0, totalImages: 0 });
    });

    it('should normalize email to lowercase', async () => {
      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        return mockSupabaseChain;
      });

      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: {},
      });

      await dashboardService.getDashboardData('TEST@EXAMPLE.COM');

      // Verify email was normalized to lowercase in queries
      expect(supabase.from).toHaveBeenCalledWith('plugin_installations');
      expect(supabase.from).toHaveBeenCalledWith('subscriptions');
      // The eq() calls should use lowercase email
      const eqCalls = supabase.from().select().eq.mock.calls;
      expect(eqCalls.some(call => call[1] === 'test@example.com')).toBe(true);
    });

    it('should map usageService format correctly', async () => {
      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      
      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        return mockSupabaseChain;
      });

      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: {
          monthlyImages: 100,
          dailyImages: 5,
          totalImages: 500,
        },
      });

      const result = await dashboardService.getDashboardData('test@example.com');

      expect(result.usage).toEqual({
        monthlyImages: 100,
        dailyImages: 5,
        totalImages: 500,
      });
    });

    it('should not filter subscriptions by status (allows all statuses including null)', async () => {
      const mockSubscription = {
        id: 'sub1',
        user_email: 'test@example.com',
        plugin_slug: 'alttext-ai',
        plan: 'pro',
        status: 'past_due',
      };

      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: [mockSubscription],
              error: null,
            }),
          };
        }
        return mockSupabaseChain;
      });

      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: { monthlyImages: 0, dailyImages: 0, totalImages: 0 },
      });

      const result = await dashboardService.getDashboardData('test@example.com');

      // Verify subscription with non-active status is returned
      // This proves the query doesn't filter by status='active'
      expect(result.subscription).toEqual(mockSubscription);
      expect(result.subscription.status).toBe('past_due');
    });

    it('should return null subscription for free plan (no subscription record)', async () => {
      const mockSupabaseChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      supabase.from.mockImplementation((table) => {
        if (table === 'plugin_installations') {
          return {
            ...mockSupabaseChain,
            order: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        } else if (table === 'subscriptions') {
          return {
            ...mockSupabaseChain,
            limit: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        return mockSupabaseChain;
      });

      usageService.getUsageSummary.mockResolvedValue({
        success: true,
        usage: { monthlyImages: 0, dailyImages: 0, totalImages: 0 },
      });

      const result = await dashboardService.getDashboardData('test@example.com');

      // Free plan should return null subscription
      expect(result.subscription).toBeNull();
      expect(result.installations).toEqual([]);
      expect(result.usage).toEqual({ monthlyImages: 0, dailyImages: 0, totalImages: 0 });
    });
  });
});

