/**
 * Analytics Routes
 * API endpoints for analytics event logging
 */

const express = require('express');
const router = express.Router();
const { analyticsEventSchema, analyticsEventOrArraySchema } = require('../validation/analyticsEventSchema');
const analyticsService = require('../services/analyticsService');

/**
 * Helper to get client IP address
 */
function getClientIp(req) {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

/**
 * POST /analytics/log
 * Log an analytics event (backward compatibility)
 * Authentication: Optional in V1 (no auth required initially)
 * Always returns 200 status to prevent analytics failures from breaking user flows
 */
router.post('/log', async (req, res) => {
  try {
    // Validate payload with Zod schema
    const validation = analyticsEventSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(200).json({
        ok: false,
        error: 'VALIDATION_ERROR',
        details: validation.error.flatten(),
      });
    }

    // Get client IP for throttling
    const clientIp = getClientIp(req);

    // Call analyticsService.logEvent (not background version - API calls can wait)
    const result = await analyticsService.logEvent({
      ...validation.data,
      ip: clientIp,
    });

    if (!result.success) {
      // Still return 200 status, but indicate failure in response
      return res.status(200).json({
        ok: false,
        error: result.error || 'Failed to log event',
        details: result.details,
      });
    }

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    // Catch any unexpected errors - always return 200
    console.error('[AnalyticsRoutes] Unexpected error in /analytics/log:', error);
    return res.status(200).json({
      ok: false,
      error: 'UNEXPECTED_ERROR',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /analytics/event
 * Log analytics event(s) - supports single event or array of events
 * Authentication: Optional in V1 (no auth required initially)
 * Always returns 200 status to prevent analytics failures from breaking user flows
 */
router.post('/event', async (req, res) => {
  try {
    // Validate payload - can be single event or array
    const validation = analyticsEventOrArraySchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(200).json({
        ok: false,
        error: 'VALIDATION_ERROR',
        details: validation.error.flatten(),
      });
    }

    const validatedData = validation.data;
    const isArray = Array.isArray(validatedData);
    const clientIp = getClientIp(req);

    // Process single event or batch
    let result;
    if (isArray) {
      // Batch processing
      result = await analyticsService.logEvents(validatedData, clientIp);
    } else {
      // Single event
      result = await analyticsService.logEvent({
        ...validatedData,
        ip: clientIp,
      });
    }

    if (!result.success) {
      // Still return 200 status, but indicate failure in response
      return res.status(200).json({
        ok: false,
        error: result.error || 'Failed to log event(s)',
        details: result.details,
        ...(isArray && result.total !== undefined ? {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
          errors: result.errors,
        } : {}),
      });
    }

    // Return success response
    if (isArray && result.total !== undefined) {
      return res.status(200).json({
        ok: true,
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        ...(result.errors?.length > 0 ? { errors: result.errors } : {}),
      });
    }

    return res.status(200).json({
      ok: true,
    });
  } catch (error) {
    // Catch any unexpected errors - always return 200
    console.error('[AnalyticsRoutes] Unexpected error in /analytics/event:', error);
    return res.status(200).json({
      ok: false,
      error: 'UNEXPECTED_ERROR',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * GET /analytics/summary
 * Get analytics summary for dashboard charts
 * Authentication: Optional (can add later if needed)
 */
router.get('/summary', async (req, res) => {
  try {
    const { email, days, startDate, endDate, eventNames } = req.query;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: 'Email query parameter is required',
      });
    }

    // Parse date range
    const options = {};
    if (days) {
      options.days = parseInt(days, 10);
      if (isNaN(options.days) || options.days < 1) {
        return res.status(400).json({
          ok: false,
          error: 'Days must be a positive integer',
        });
      }
    }
    if (startDate) {
      options.startDate = new Date(startDate);
      if (isNaN(options.startDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid startDate format',
        });
      }
    }
    if (endDate) {
      options.endDate = new Date(endDate);
      if (isNaN(options.endDate.getTime())) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid endDate format',
        });
      }
    }

    // If specific event names requested, use getEventCounts
    if (eventNames) {
      const eventNamesArray = Array.isArray(eventNames) 
        ? eventNames 
        : eventNames.split(',').map(name => name.trim()).filter(Boolean);
      
      if (eventNamesArray.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'eventNames must contain at least one event name',
        });
      }

      const result = await analyticsService.getEventCounts(email, eventNamesArray, options);
      
      if (!result.success) {
        return res.status(200).json({
          ok: false,
          error: result.error || 'Failed to get event counts',
        });
      }

      return res.status(200).json({
        ok: true,
        counts: result.counts,
        dateRange: result.dateRange,
      });
    }

    // Otherwise, get full summary
    const result = await analyticsService.getAnalyticsSummary(email, options);

    if (!result.success) {
      return res.status(200).json({
        ok: false,
        error: result.error || 'Failed to get analytics summary',
      });
    }

    return res.status(200).json({
      ok: true,
      summary: result.summary,
    });
  } catch (error) {
    console.error('[AnalyticsRoutes] Unexpected error in /analytics/summary:', error);
    return res.status(500).json({
      ok: false,
      error: 'UNEXPECTED_ERROR',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

module.exports = router;
