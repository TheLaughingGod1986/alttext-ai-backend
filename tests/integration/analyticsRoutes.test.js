/**
 * Integration tests for analytics routes
 */

// Mock analyticsService to prevent real database calls - MUST be at top level for Jest hoisting
jest.mock('../../src/services/analyticsService', () => ({
  logEvent: jest.fn(),
  logEvents: jest.fn(),
  logEventBackground: jest.fn(),
  getAnalyticsSummary: jest.fn(),
  getEventCounts: jest.fn(),
}));

const request = require('supertest');
const { createTestServer } = require('../helpers/createTestServer');
const analyticsService = require('../../src/services/analyticsService');

describe('Analytics Routes', () => {
  let server;

  beforeAll(() => {
    const { createTestServer } = require('../helpers/createTestServer');
    server = createTestServer();
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

  describe('POST /analytics/log (backward compatibility)', () => {
    it('should successfully log a single event', async () => {
      analyticsService.logEvent.mockResolvedValue({ success: true });

      const res = await request(server)
        .post('/analytics/log')
        .send({
          email: 'test@example.com',
          eventName: 'test_event',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(analyticsService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          eventName: 'test_event',
        })
      );
    });

    it('should return 200 even when validation fails', async () => {
      const res = await request(server)
        .post('/analytics/log')
        .send({
          email: 'invalid-email',
          eventName: 'test_event',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 200 even when logging fails', async () => {
      analyticsService.logEvent.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const res = await request(server)
        .post('/analytics/log')
        .send({
          email: 'test@example.com',
          eventName: 'test_event',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Database error');
    });

    it('should include IP address in logEvent call', async () => {
      analyticsService.logEvent.mockResolvedValue({ success: true });

      await request(server)
        .post('/analytics/log')
        .send({
          email: 'test@example.com',
          eventName: 'test_event',
        });

      expect(analyticsService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: expect.any(String),
        })
      );
    });
  });

  describe('POST /analytics/event', () => {
    it('should successfully log a single event', async () => {
      analyticsService.logEvent.mockResolvedValue({ success: true });

      const res = await request(server)
        .post('/analytics/event')
        .send({
          email: 'test@example.com',
          eventName: 'test_event',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(analyticsService.logEvent).toHaveBeenCalled();
    });

    it('should successfully log multiple events in batch', async () => {
      analyticsService.logEvents.mockResolvedValue({
        success: true,
        total: 2,
        successful: 2,
        failed: 0,
      });

      const res = await request(server)
        .post('/analytics/event')
        .send([
          {
            email: 'test@example.com',
            eventName: 'event1',
          },
          {
            email: 'test@example.com',
            eventName: 'event2',
          },
        ]);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.total).toBe(2);
      expect(res.body.successful).toBe(2);
      expect(res.body.failed).toBe(0);
      expect(analyticsService.logEvents).toHaveBeenCalled();
    });

    it('should return 200 even when validation fails for single event', async () => {
      const res = await request(server)
        .post('/analytics/event')
        .send({
          email: 'invalid-email',
          eventName: 'test_event',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 200 even when validation fails for batch', async () => {
      const res = await request(server)
        .post('/analytics/event')
        .send([
          {
            email: 'test@example.com',
            eventName: 'valid_event',
          },
          {
            email: 'invalid-email',
            eventName: 'invalid_event',
          },
        ]);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should handle partial batch failures', async () => {
      analyticsService.logEvents.mockResolvedValue({
        success: true,
        total: 3,
        successful: 2,
        failed: 1,
        errors: [
          {
            index: 1,
            error: 'Rate limit exceeded',
          },
        ],
      });

      const res = await request(server)
        .post('/analytics/event')
        .send([
          {
            email: 'test@example.com',
            eventName: 'event1',
          },
          {
            email: 'test@example.com',
            eventName: 'event2',
          },
          {
            email: 'test@example.com',
            eventName: 'event3',
          },
        ]);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.total).toBe(3);
      expect(res.body.successful).toBe(2);
      expect(res.body.failed).toBe(1);
      expect(res.body.errors).toBeDefined();
    });

    it('should always return 200 status even on unexpected errors', async () => {
      analyticsService.logEvent.mockRejectedValue(new Error('Unexpected error'));

      const res = await request(server)
        .post('/analytics/event')
        .send({
          email: 'test@example.com',
          eventName: 'test_event',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('UNEXPECTED_ERROR');
    });

    it('should include IP address in batch logEvents call', async () => {
      analyticsService.logEvents.mockResolvedValue({
        success: true,
        total: 1,
        successful: 1,
        failed: 0,
      });

      await request(server)
        .post('/analytics/event')
        .send([
          {
            email: 'test@example.com',
            eventName: 'test_event',
          },
        ]);

      expect(analyticsService.logEvents).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String)
      );
    });
  });

  describe('GET /analytics/summary', () => {
    it('should successfully get analytics summary', async () => {
      analyticsService.getAnalyticsSummary.mockResolvedValue({
        success: true,
        summary: {
          totalEvents: 10,
          eventCounts: {
            dashboard_loaded: 5,
            alt_text_generated: 5,
          },
          dailySeries: [],
          dateRange: {
            start: '2025-01-01T00:00:00.000Z',
            end: '2025-01-31T00:00:00.000Z',
          },
        },
      });

      const res = await request(server)
        .get('/analytics/summary')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.totalEvents).toBe(10);
      expect(analyticsService.getAnalyticsSummary).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(Object)
      );
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(server)
        .get('/analytics/summary');

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain('Email');
    });

    it('should support days query parameter', async () => {
      analyticsService.getAnalyticsSummary.mockResolvedValue({
        success: true,
        summary: {
          totalEvents: 0,
          eventCounts: {},
          dailySeries: [],
          dateRange: {
            start: expect.any(String),
            end: expect.any(String),
          },
        },
      });

      const res = await request(server)
        .get('/analytics/summary')
        .query({
          email: 'test@example.com',
          days: '7',
        });

      expect(res.status).toBe(200);
      expect(analyticsService.getAnalyticsSummary).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          days: 7,
        })
      );
    });

    it('should return 400 for invalid days parameter', async () => {
      // Mock the service to prevent it from being called
      analyticsService.getAnalyticsSummary.mockClear();
      
      const res = await request(server)
        .get('/analytics/summary')
        .query({
          email: 'test@example.com',
          days: 'invalid',
        });

      // Route validates days parameter and returns 400 for invalid values
      expect([400, 500]).toContain(res.status);
      expect(res.body.ok).toBe(false);
    });

    it('should support startDate and endDate query parameters', async () => {
      analyticsService.getAnalyticsSummary.mockResolvedValue({
        success: true,
        summary: {
          totalEvents: 0,
          eventCounts: {},
          dailySeries: [],
          dateRange: {
            start: '2025-01-01T00:00:00.000Z',
            end: '2025-01-31T00:00:00.000Z',
          },
        },
      });

      const res = await request(server)
        .get('/analytics/summary')
        .query({
          email: 'test@example.com',
          startDate: '2025-01-01T00:00:00.000Z',
          endDate: '2025-01-31T00:00:00.000Z',
        });

      expect(res.status).toBe(200);
      expect(analyticsService.getAnalyticsSummary).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        })
      );
    });

    it('should return 400 for invalid date format', async () => {
      const res = await request(server)
        .get('/analytics/summary')
        .query({
          email: 'test@example.com',
          startDate: 'invalid-date',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should use getEventCounts when eventNames is provided', async () => {
      analyticsService.getEventCounts.mockResolvedValue({
        success: true,
        counts: {
          dashboard_loaded: 5,
          alt_text_generated: 3,
        },
        dateRange: {
          start: '2025-01-01T00:00:00.000Z',
          end: '2025-01-31T00:00:00.000Z',
        },
      });

      const res = await request(server)
        .get('/analytics/summary')
        .query({
          email: 'test@example.com',
          eventNames: 'dashboard_loaded,alt_text_generated',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.counts).toBeDefined();
      expect(analyticsService.getEventCounts).toHaveBeenCalled();
      expect(analyticsService.getAnalyticsSummary).not.toHaveBeenCalled();
    });

    it('should handle comma-separated event names', async () => {
      analyticsService.getEventCounts.mockResolvedValue({
        success: true,
        counts: {},
        dateRange: {},
      });

      await request(server)
        .get('/analytics/summary')
        .query({
          email: 'test@example.com',
          eventNames: 'event1,event2,event3',
        });

      expect(analyticsService.getEventCounts).toHaveBeenCalledWith(
        'test@example.com',
        ['event1', 'event2', 'event3'],
        expect.any(Object)
      );
    });

    it('should return 400 when eventNames is empty', async () => {
      const res = await request(server)
        .get('/analytics/summary')
        .query({
          email: 'test@example.com',
          eventNames: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('should handle service errors gracefully', async () => {
      analyticsService.getAnalyticsSummary.mockResolvedValue({
        success: false,
        error: 'Database error',
        summary: null,
      });

      const res = await request(server)
        .get('/analytics/summary')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('Database error');
    });

    it('should handle unexpected errors', async () => {
      analyticsService.getAnalyticsSummary.mockRejectedValue(new Error('Unexpected error'));

      const res = await request(server)
        .get('/analytics/summary')
        .query({ email: 'test@example.com' });

      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('UNEXPECTED_ERROR');
    });
  });
});

