jest.mock('../../db/supabase-client', () => require('../mocks/supabase.mock'));
jest.mock('../../src/services/creditsService', () => ({
  getOrCreateIdentity: jest.fn(),
}));

const dashboardChartsService = require('../../src/services/dashboardChartsService');
const supabaseMock = require('../mocks/supabase.mock');
const creditsService = require('../../src/services/creditsService');

describe('Dashboard Charts Service', () => {
  beforeEach(() => {
    supabaseMock.__reset();
    jest.clearAllMocks();
  });

  describe('getDailyUsage', () => {
    it('should return 30 days of usage data with correct format', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      const mockUsageLogs = [
        { created_at: new Date().toISOString(), metadata: null },
        { created_at: new Date(Date.now() - 86400000).toISOString(), metadata: null }, // Yesterday
      ];

      supabaseMock.__queueResponse('usage_logs', 'select', {
        data: mockUsageLogs,
        error: null,
      });

      const result = await dashboardChartsService.getDailyUsage('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(30);
      expect(result[0]).toHaveProperty('date');
      expect(result[0]).toHaveProperty('images');
      expect(result[0]).toHaveProperty('tokens');
      expect(typeof result[0].date).toBe('string');
      expect(typeof result[0].images).toBe('number');
      expect(typeof result[0].tokens).toBe('number');
    });

    it('should return all zeros when identity not found', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: false,
        error: 'Identity not found',
      });

      const result = await dashboardChartsService.getDailyUsage('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(30);
      expect(result.every(day => day.images === 0 && day.tokens === 0)).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      supabaseMock.__queueResponse('usage_logs', 'select', {
        data: null,
        error: { message: 'Database error' },
      });

      const result = await dashboardChartsService.getDailyUsage('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(30);
      expect(result.every(day => day.images === 0 && day.tokens === 0)).toBe(true);
    });

    it('should group usage by date correctly', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const mockUsageLogs = [
        { created_at: `${todayStr}T10:00:00Z`, metadata: null },
        { created_at: `${todayStr}T15:00:00Z`, metadata: null },
        { created_at: `${todayStr}T20:00:00Z`, metadata: null },
      ];

      supabaseMock.__queueResponse('usage_logs', 'select', {
        data: mockUsageLogs,
        error: null,
      });

      const result = await dashboardChartsService.getDailyUsage('test@example.com');
      const todayEntry = result.find(day => day.date === todayStr);
      
      expect(todayEntry).toBeDefined();
      expect(todayEntry.images).toBe(3);
      expect(todayEntry.tokens).toBeGreaterThan(0); // Should have tokens (approximated or from metadata)
    });
  });

  describe('getMonthlyUsage', () => {
    it('should return 12 months of usage data with correct format', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      const mockUsageLogs = [
        { created_at: new Date().toISOString() },
        { created_at: new Date(Date.now() - 86400000 * 15).toISOString() },
      ];

      supabaseMock.__queueResponse('usage_logs', 'select', {
        data: mockUsageLogs,
        error: null,
      });

      const result = await dashboardChartsService.getMonthlyUsage('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(12);
      expect(result[0]).toHaveProperty('month');
      expect(result[0]).toHaveProperty('images');
      expect(result[0]).toHaveProperty('tokens');
      expect(typeof result[0].month).toBe('string');
      expect(result[0].month.match(/^\d{4}-\d{2}$/)).toBeTruthy(); // YYYY-MM format
      expect(typeof result[0].images).toBe('number');
      expect(typeof result[0].tokens).toBe('number');
    });

    it('should return all zeros when identity not found', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: false,
        error: 'Identity not found',
      });

      const result = await dashboardChartsService.getMonthlyUsage('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(12);
      expect(result.every(month => month.images === 0 && month.tokens === 0)).toBe(true);
    });

    it('should group usage by month correctly', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const mockUsageLogs = [
        { created_at: `${monthStr}-01T10:00:00Z`, metadata: null },
        { created_at: `${monthStr}-15T15:00:00Z`, metadata: null },
        { created_at: `${monthStr}-28T20:00:00Z`, metadata: null },
      ];

      supabaseMock.__queueResponse('usage_logs', 'select', {
        data: mockUsageLogs,
        error: null,
      });

      const result = await dashboardChartsService.getMonthlyUsage('test@example.com');
      const monthEntry = result.find(month => month.month === monthStr);
      
      expect(monthEntry).toBeDefined();
      expect(monthEntry.images).toBe(3);
      expect(monthEntry.tokens).toBeGreaterThan(0); // Should have tokens
    });
  });

  describe('getCreditTrend', () => {
    it('should return credit trend data with correct format', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      supabaseMock.__queueResponse('identities', 'select', {
        data: [{ credits_balance: 500 }],
        error: null,
      });

      supabaseMock.__queueResponse('subscriptions', 'select', {
        data: [{ plan: 'pro' }],
        error: null,
      });

      supabaseMock.__queueResponse('credits_transactions', 'select', {
        data: [
          {
            created_at: new Date().toISOString(),
            balance_after: 500,
          },
        ],
        error: null,
      });

      const result = await dashboardChartsService.getCreditTrend('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('date');
        expect(result[0]).toHaveProperty('creditsRemaining');
        expect(result[0]).toHaveProperty('plan');
        expect(typeof result[0].creditsRemaining).toBe('number');
        expect(typeof result[0].plan).toBe('string');
      }
    });
  });

  describe('getSubscriptionHistory', () => {
    it('should return subscription history events', async () => {
      supabaseMock.__queueResponse('subscriptions', 'select', {
        data: [
          {
            plan: 'free',
            status: 'active',
            created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
            updated_at: new Date().toISOString(),
            canceled_at: null,
          },
        ],
        error: null,
      });

      const result = await dashboardChartsService.getSubscriptionHistory('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('date');
        expect(result[0]).toHaveProperty('plan');
        expect(result[0]).toHaveProperty('event');
        expect(['started', 'upgraded', 'downgraded', 'cancelled', 'renewed']).toContain(result[0].event);
      }
    });
  });

  describe('getInstallActivity', () => {
    it('should return install activity by date and plugin', async () => {
      supabaseMock.__queueResponse('plugin_installations', 'select', {
        data: [
          {
            plugin_slug: 'alttext-ai',
            created_at: new Date().toISOString(),
          },
        ],
        error: null,
      });

      const result = await dashboardChartsService.getInstallActivity('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('date');
        expect(result[0]).toHaveProperty('plugin');
        expect(result[0]).toHaveProperty('installs');
        expect(typeof result[0].installs).toBe('number');
      }
    });
  });

  describe('getAnalyticsCharts', () => {
    it('should return heatmap and event summary', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      const mockEvents = [
        {
          event_name: 'dashboard_load',
          created_at: new Date().toISOString(),
        },
        {
          event_name: 'alt_text_generated',
          created_at: new Date().toISOString(),
        },
      ];

      supabaseMock.__queueResponse('analytics_events', 'select', {
        data: mockEvents,
        error: null,
      });

      const result = await dashboardChartsService.getAnalyticsCharts('test@example.com');

      expect(result).toHaveProperty('heatmap');
      expect(result).toHaveProperty('eventSummary');
      expect(Array.isArray(result.heatmap)).toBe(true);
      expect(Array.isArray(result.eventSummary)).toBe(true);
      if (result.eventSummary.length > 0) {
        expect(result.eventSummary[0]).toHaveProperty('eventType');
        expect(result.eventSummary[0]).toHaveProperty('count');
      }
      if (result.heatmap.length > 0) {
        expect(result.heatmap[0]).toHaveProperty('weekday');
        expect(result.heatmap[0]).toHaveProperty('hour');
        expect(result.heatmap[0]).toHaveProperty('events');
      }
    });
  });

  describe('getRecentEvents', () => {
    it('should return recent events with correct format', async () => {
      const mockEvents = [
        {
          event_name: 'alttext_generated',
          created_at: new Date().toISOString(),
          event_data: { image_id: 'test-123' },
        },
        {
          event_name: 'dashboard_loaded',
          created_at: new Date(Date.now() - 1000).toISOString(),
          event_data: {},
        },
      ];

      supabaseMock.__queueResponse('analytics_events', 'select', {
        data: mockEvents,
        error: null,
      });

      const result = await dashboardChartsService.getRecentEvents('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('event');
      expect(result[0]).toHaveProperty('created_at');
      expect(result[0]).toHaveProperty('meta');
      expect(result[0].event).toBe('alttext_generated');
      expect(typeof result[0].meta).toBe('object');
    });

    it('should limit to 50 events', async () => {
      const mockEvents = Array.from({ length: 60 }, (_, i) => ({
        event_name: 'test_event',
        created_at: new Date(Date.now() - i * 1000).toISOString(),
        event_data: {},
      }));

      supabaseMock.__queueResponse('analytics_events', 'select', {
        data: mockEvents,
        error: null,
      });

      const result = await dashboardChartsService.getRecentEvents('test@example.com');

      // Supabase limit should enforce 50, but if not, we expect max 50
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should return empty array on database error', async () => {
      supabaseMock.__queueResponse('analytics_events', 'select', {
        data: null,
        error: { message: 'Database error' },
      });

      const result = await dashboardChartsService.getRecentEvents('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle missing event_data gracefully', async () => {
      const mockEvents = [
        {
          event_name: 'test_event',
          created_at: new Date().toISOString(),
          event_data: null,
        },
      ];

      supabaseMock.__queueResponse('analytics_events', 'select', {
        data: mockEvents,
        error: null,
      });

      const result = await dashboardChartsService.getRecentEvents('test@example.com');

      expect(result[0].meta).toEqual({});
    });
  });

  describe('getPluginActivity', () => {
    it('should return plugin activity with correct format', async () => {
      const mockInstallations = [
        {
          plugin_slug: 'alttext-ai',
          last_seen_at: new Date().toISOString(),
          site_url: 'https://example.com',
        },
        {
          plugin_slug: 'seo-ai-meta',
          last_seen_at: new Date(Date.now() - 86400000).toISOString(),
          site_url: 'https://test.com',
        },
      ];

      supabaseMock.__queueResponse('plugin_installations', 'select', {
        data: mockInstallations,
        error: null,
      });

      const result = await dashboardChartsService.getPluginActivity('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('plugin_slug');
      expect(result[0]).toHaveProperty('last_seen_at');
      expect(result[0]).toHaveProperty('site_url');
      expect(result[0].plugin_slug).toBe('alttext-ai');
    });

    it('should return empty array when no installations found', async () => {
      supabaseMock.__queueResponse('plugin_installations', 'select', {
        data: [],
        error: null,
      });

      const result = await dashboardChartsService.getPluginActivity('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle null site_url gracefully', async () => {
      const mockInstallations = [
        {
          plugin_slug: 'alttext-ai',
          last_seen_at: new Date().toISOString(),
          site_url: null,
        },
      ];

      supabaseMock.__queueResponse('plugin_installations', 'select', {
        data: mockInstallations,
        error: null,
      });

      const result = await dashboardChartsService.getPluginActivity('test@example.com');

      expect(result[0].site_url).toBe(null);
    });

    it('should return empty array on database error', async () => {
      supabaseMock.__queueResponse('plugin_installations', 'select', {
        data: null,
        error: { message: 'Database error' },
      });

      const result = await dashboardChartsService.getPluginActivity('test@example.com');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('getDashboardCharts', () => {
    it('should aggregate all chart data correctly with unified structure', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      supabaseMock.__queueResponse('usage_logs', 'select', {
        data: [],
        error: null,
      });

      supabaseMock.__queueResponse('credits_transactions', 'select', {
        data: [],
        error: null,
      });

      supabaseMock.__queueResponse('subscriptions', 'select', {
        data: [],
        error: null,
      });

      supabaseMock.__queueResponse('plugin_installations', 'select', {
        data: [],
        error: null,
      });

      supabaseMock.__queueResponse('analytics_events', 'select', {
        data: [],
        error: null,
      });

      supabaseMock.__queueResponse('identities', 'select', {
        data: [{ credits_balance: 0 }],
        error: null,
      });

      const result = await dashboardChartsService.getDashboardCharts('test@example.com');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('charts');
      expect(result.success).toBe(true);
      expect(result.charts).toHaveProperty('dailyUsage');
      expect(result.charts).toHaveProperty('monthlyUsage');
      expect(result.charts).toHaveProperty('creditTrend');
      expect(result.charts).toHaveProperty('subscriptionHistory');
      expect(result.charts).toHaveProperty('installActivity');
      expect(result.charts).toHaveProperty('usageHeatmap');
      expect(result.charts).toHaveProperty('eventSummary');
      expect(Array.isArray(result.charts.dailyUsage)).toBe(true);
      expect(Array.isArray(result.charts.monthlyUsage)).toBe(true);
      expect(Array.isArray(result.charts.creditTrend)).toBe(true);
      expect(Array.isArray(result.charts.subscriptionHistory)).toBe(true);
      expect(Array.isArray(result.charts.installActivity)).toBe(true);
      expect(Array.isArray(result.charts.usageHeatmap)).toBe(true);
      expect(Array.isArray(result.charts.eventSummary)).toBe(true);
    });

    it('should handle errors gracefully and return all chart arrays', async () => {
      creditsService.getOrCreateIdentity.mockRejectedValue(new Error('Test error'));

      const result = await dashboardChartsService.getDashboardCharts('test@example.com');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('charts');
      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      // All chart arrays must always be present
      expect(Array.isArray(result.charts.dailyUsage)).toBe(true);
      expect(Array.isArray(result.charts.monthlyUsage)).toBe(true);
      expect(Array.isArray(result.charts.creditTrend)).toBe(true);
      expect(Array.isArray(result.charts.subscriptionHistory)).toBe(true);
      expect(Array.isArray(result.charts.installActivity)).toBe(true);
      expect(Array.isArray(result.charts.usageHeatmap)).toBe(true);
      expect(Array.isArray(result.charts.eventSummary)).toBe(true);
    });

    it('should return all chart arrays even when data is empty', async () => {
      creditsService.getOrCreateIdentity.mockResolvedValue({
        success: true,
        identityId: 'test-identity-id',
      });

      // Mock all queries to return empty
      supabaseMock.__queueResponse('usage_logs', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('credits_transactions', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('subscriptions', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('plugin_installations', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('analytics_events', 'select', { data: [], error: null });
      supabaseMock.__queueResponse('identities', 'select', { data: [{ credits_balance: 0 }], error: null });

      const result = await dashboardChartsService.getDashboardCharts('test@example.com');

      expect(result.success).toBe(true);
      expect(result.charts.dailyUsage.length).toBe(30); // Should have 30 days filled
      expect(result.charts.monthlyUsage.length).toBe(12); // Should have 12 months filled
      expect(Array.isArray(result.charts.creditTrend)).toBe(true);
      expect(Array.isArray(result.charts.subscriptionHistory)).toBe(true);
      expect(Array.isArray(result.charts.installActivity)).toBe(true);
      expect(Array.isArray(result.charts.usageHeatmap)).toBe(true);
      expect(Array.isArray(result.charts.eventSummary)).toBe(true);
    });
  });
});

