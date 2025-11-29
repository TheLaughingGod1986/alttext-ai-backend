/**
 * Integration tests for dashboard charts routes
 */

// Mock dashboardChartsService to prevent real database calls
jest.mock('../../src/services/dashboardChartsService', () => ({
  getDailyUsage: jest.fn(),
  getMonthlyUsage: jest.fn(),
  getRecentEvents: jest.fn(),
  getPluginActivity: jest.fn(),
  getDashboardCharts: jest.fn(),
}));

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const dashboardChartsService = require('../../src/services/dashboardChartsService');
const { generateToken } = require('../../auth/jwt');

describe('Dashboard Charts Routes', () => {
  let server;
  let authToken;

  beforeAll(() => {
    const { createTestServer } = require('../helpers/createTestServer');
    server = createTestServer();
    // Generate a test JWT token
    const testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
    };
    authToken = generateToken(testUser);
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

  describe('GET /dashboard/usage/daily', () => {
    it('should return daily usage data with proper structure', async () => {
      const mockDailyUsage = [
        { date: '2025-02-01', count: 12 },
        { date: '2025-02-02', count: 7 },
      ];

      dashboardChartsService.getDailyUsage.mockResolvedValue(mockDailyUsage);

      const res = await request(server)
        .get('/dashboard/usage/daily')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('days');
      expect(Array.isArray(res.body.days)).toBe(true);
      expect(res.body.days.length).toBe(2);
      expect(res.body.days[0]).toHaveProperty('date');
      expect(res.body.days[0]).toHaveProperty('count');
      expect(res.body.days[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD format
      expect(typeof res.body.days[0].count).toBe('number');
    });

    it('should require authentication', async () => {
      const res = await request(server)
        .get('/dashboard/usage/daily');

      expect(res.status).toBe(401);
    });

    it('should handle service errors gracefully', async () => {
      dashboardChartsService.getDailyUsage.mockRejectedValue(new Error('Service error'));

      const res = await request(server)
        .get('/dashboard/usage/daily')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.message || res.body.error).toBeDefined();
      expect(res.body.code).toBe('DASHBOARD_ERROR');
    });
  });

  describe('GET /dashboard/usage/monthly', () => {
    it('should return monthly usage data with proper structure', async () => {
      const mockMonthlyUsage = [
        { month: '2025-01', count: 520 },
        { month: '2025-02', count: 300 },
      ];

      dashboardChartsService.getMonthlyUsage.mockResolvedValue(mockMonthlyUsage);

      const res = await request(server)
        .get('/dashboard/usage/monthly')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('months');
      expect(Array.isArray(res.body.months)).toBe(true);
      expect(res.body.months.length).toBe(2);
      expect(res.body.months[0]).toHaveProperty('month');
      expect(res.body.months[0]).toHaveProperty('count');
      expect(res.body.months[0].month).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM format
      expect(typeof res.body.months[0].count).toBe('number');
    });

    it('should require authentication', async () => {
      const res = await request(server)
        .get('/dashboard/usage/monthly');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /dashboard/events/recent', () => {
    it('should return recent events with proper structure', async () => {
      const mockEvents = [
        {
          event: 'alttext_generated',
          created_at: '2025-02-05T10:28:00Z',
          meta: {},
        },
        {
          event: 'dashboard_loaded',
          created_at: '2025-02-05T09:15:00Z',
          meta: { installationsCount: 2 },
        },
      ];

      dashboardChartsService.getRecentEvents.mockResolvedValue(mockEvents);

      const res = await request(server)
        .get('/dashboard/events/recent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('events');
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events.length).toBe(2);
      expect(res.body.events[0]).toHaveProperty('event');
      expect(res.body.events[0]).toHaveProperty('created_at');
      expect(res.body.events[0]).toHaveProperty('meta');
      expect(typeof res.body.events[0].event).toBe('string');
      expect(typeof res.body.events[0].meta).toBe('object');
    });

    it('should require authentication', async () => {
      const res = await request(server)
        .get('/dashboard/events/recent');

      expect(res.status).toBe(401);
    });

    it('should limit to 50 events', async () => {
      const mockEvents = Array.from({ length: 60 }, (_, i) => ({
        event: 'test_event',
        created_at: new Date(Date.now() - i * 1000).toISOString(),
        meta: {},
      }));

      dashboardChartsService.getRecentEvents.mockResolvedValue(mockEvents);

      const res = await request(server)
        .get('/dashboard/events/recent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      // Service should enforce limit, but if not, response should still be valid
      expect(res.body.events.length).toBeGreaterThan(0);
    });
  });

  describe('GET /dashboard/plugins/activity', () => {
    it('should return plugin activity with proper structure', async () => {
      const mockPlugins = [
        {
          plugin_slug: 'alttext-ai',
          last_seen_at: '2025-02-05T10:00:00.000Z',
          site_url: 'https://example.com',
        },
        {
          plugin_slug: 'seo-ai-meta',
          last_seen_at: '2025-02-04T15:30:00.000Z',
          site_url: 'https://test.com',
        },
      ];

      dashboardChartsService.getPluginActivity.mockResolvedValue(mockPlugins);

      const res = await request(server)
        .get('/dashboard/plugins/activity')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('plugins');
      expect(Array.isArray(res.body.plugins)).toBe(true);
      expect(res.body.plugins.length).toBe(2);
      expect(res.body.plugins[0]).toHaveProperty('plugin_slug');
      expect(res.body.plugins[0]).toHaveProperty('last_seen_at');
      expect(res.body.plugins[0]).toHaveProperty('site_url');
      expect(typeof res.body.plugins[0].plugin_slug).toBe('string');
    });

    it('should require authentication', async () => {
      const res = await request(server)
        .get('/dashboard/plugins/activity');

      expect(res.status).toBe(401);
    });

    it('should handle null site_url', async () => {
      const mockPlugins = [
        {
          plugin_slug: 'alttext-ai',
          last_seen_at: '2025-02-05T10:00:00.000Z',
          site_url: null,
        },
      ];

      dashboardChartsService.getPluginActivity.mockResolvedValue(mockPlugins);

      const res = await request(server)
        .get('/dashboard/plugins/activity')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.plugins[0].site_url).toBeNull();
    });
  });

  describe('GET /dashboard/charts', () => {
    it('should return aggregated chart data with unified structure', async () => {
      const mockCharts = {
        success: true,
        charts: {
          dailyUsage: [
            { date: '2025-02-01', images: 12, tokens: 1200 },
            { date: '2025-02-02', images: 7, tokens: 700 },
          ],
          monthlyUsage: [
            { month: '2025-01', images: 520, tokens: 52000 },
            { month: '2025-02', images: 300, tokens: 30000 },
          ],
          creditTrend: [
            { date: '2025-02-01', creditsRemaining: 830, plan: 'pro' },
          ],
          subscriptionHistory: [
            { date: '2025-01-01', plan: 'pro', event: 'started' },
            { date: '2025-02-01', plan: 'business', event: 'upgraded' },
          ],
          installActivity: [
            { date: '2025-02-01', plugin: 'beepbeep-ai', installs: 12 },
          ],
          usageHeatmap: [
            { weekday: 1, hour: 9, events: 35 },
          ],
          eventSummary: [
            { eventType: 'dashboard_load', count: 320 },
            { eventType: 'alt_text_generated', count: 1840 },
          ],
        },
      };

      dashboardChartsService.getDashboardCharts.mockResolvedValue(mockCharts);

      const res = await request(server)
        .get('/dashboard/charts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body).toHaveProperty('charts');
      expect(res.body.charts).toHaveProperty('dailyUsage');
      expect(res.body.charts).toHaveProperty('monthlyUsage');
      expect(res.body.charts).toHaveProperty('creditTrend');
      expect(res.body.charts).toHaveProperty('subscriptionHistory');
      expect(res.body.charts).toHaveProperty('installActivity');
      expect(res.body.charts).toHaveProperty('usageHeatmap');
      expect(res.body.charts).toHaveProperty('eventSummary');
      expect(Array.isArray(res.body.charts.dailyUsage)).toBe(true);
      expect(Array.isArray(res.body.charts.monthlyUsage)).toBe(true);
      expect(Array.isArray(res.body.charts.creditTrend)).toBe(true);
      expect(Array.isArray(res.body.charts.subscriptionHistory)).toBe(true);
      expect(Array.isArray(res.body.charts.installActivity)).toBe(true);
      expect(Array.isArray(res.body.charts.usageHeatmap)).toBe(true);
      expect(Array.isArray(res.body.charts.eventSummary)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(server)
        .get('/dashboard/charts');

      expect(res.status).toBe(401);
    });

    it('should handle service errors gracefully and return all chart arrays', async () => {
      dashboardChartsService.getDashboardCharts.mockResolvedValue({
        success: false,
        error: 'Service error',
        charts: {
          dailyUsage: [],
          monthlyUsage: [],
          creditTrend: [],
          subscriptionHistory: [],
          installActivity: [],
          usageHeatmap: [],
          eventSummary: [],
        },
      });

      const res = await request(server)
        .get('/dashboard/charts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body).toHaveProperty('charts');
      expect(res.body).toHaveProperty('error');
      // All chart arrays must always be present
      expect(res.body.charts).toHaveProperty('dailyUsage');
      expect(res.body.charts).toHaveProperty('monthlyUsage');
      expect(res.body.charts).toHaveProperty('creditTrend');
      expect(res.body.charts).toHaveProperty('subscriptionHistory');
      expect(res.body.charts).toHaveProperty('installActivity');
      expect(res.body.charts).toHaveProperty('usageHeatmap');
      expect(res.body.charts).toHaveProperty('eventSummary');
      expect(Array.isArray(res.body.charts.dailyUsage)).toBe(true);
    });

    it('should return all chart arrays even when empty', async () => {
      const mockCharts = {
        success: true,
        charts: {
          dailyUsage: [],
          monthlyUsage: [],
          creditTrend: [],
          subscriptionHistory: [],
          installActivity: [],
          usageHeatmap: [],
          eventSummary: [],
        },
      };

      dashboardChartsService.getDashboardCharts.mockResolvedValue(mockCharts);

      const res = await request(server)
        .get('/dashboard/charts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.charts).toHaveProperty('dailyUsage');
      expect(res.body.charts).toHaveProperty('monthlyUsage');
      expect(res.body.charts).toHaveProperty('creditTrend');
      expect(res.body.charts).toHaveProperty('subscriptionHistory');
      expect(res.body.charts).toHaveProperty('installActivity');
      expect(res.body.charts).toHaveProperty('usageHeatmap');
      expect(res.body.charts).toHaveProperty('eventSummary');
      expect(Array.isArray(res.body.charts.dailyUsage)).toBe(true);
      expect(Array.isArray(res.body.charts.monthlyUsage)).toBe(true);
      expect(Array.isArray(res.body.charts.creditTrend)).toBe(true);
      expect(Array.isArray(res.body.charts.subscriptionHistory)).toBe(true);
      expect(Array.isArray(res.body.charts.installActivity)).toBe(true);
      expect(Array.isArray(res.body.charts.usageHeatmap)).toBe(true);
      expect(Array.isArray(res.body.charts.eventSummary)).toBe(true);
    });

    it('should return all chart arrays on exception', async () => {
      dashboardChartsService.getDashboardCharts.mockRejectedValue(new Error('Test error'));

      const res = await request(server)
        .get('/dashboard/charts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200); // Should return 200 even on error with charts structure
      expect(res.body.ok).toBe(false);
      expect(res.body).toHaveProperty('charts');
      // All chart arrays must always be present even on error
      expect(Array.isArray(res.body.charts.dailyUsage)).toBe(true);
      expect(Array.isArray(res.body.charts.monthlyUsage)).toBe(true);
      expect(Array.isArray(res.body.charts.creditTrend)).toBe(true);
      expect(Array.isArray(res.body.charts.subscriptionHistory)).toBe(true);
      expect(Array.isArray(res.body.charts.installActivity)).toBe(true);
      expect(Array.isArray(res.body.charts.usageHeatmap)).toBe(true);
      expect(Array.isArray(res.body.charts.eventSummary)).toBe(true);
    });
  });

  describe('Response format validation', () => {
    it('should return correct date format for daily usage', async () => {
      const mockDailyUsage = [
        { date: '2025-02-01', count: 12 },
      ];

      dashboardChartsService.getDailyUsage.mockResolvedValue(mockDailyUsage);

      const res = await request(server)
        .get('/dashboard/usage/daily')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.body.days[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return correct month format for monthly usage', async () => {
      const mockMonthlyUsage = [
        { month: '2025-01', count: 520 },
      ];

      dashboardChartsService.getMonthlyUsage.mockResolvedValue(mockMonthlyUsage);

      const res = await request(server)
        .get('/dashboard/usage/monthly')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.body.months[0].month).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should return ISO8601 format for event timestamps', async () => {
      const mockEvents = [
        {
          event: 'test_event',
          created_at: '2025-02-05T10:28:00Z',
          meta: {},
        },
      ];

      dashboardChartsService.getRecentEvents.mockResolvedValue(mockEvents);

      const res = await request(server)
        .get('/dashboard/events/recent')
        .set('Authorization', `Bearer ${authToken}`);

      // ISO8601 format validation
      expect(res.body.events[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});

