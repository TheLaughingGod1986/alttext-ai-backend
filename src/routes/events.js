/**
 * Events Routes
 * Unified event logging endpoint
 * POST /events/log - Log an event to the unified events table
 */

const express = require('express');
const { authenticateToken } = require('../../auth/jwt');
const eventService = require('../services/eventService');
const creditsService = require('../services/creditsService');

const router = express.Router();

/**
 * POST /events/log
 * Log an event to the unified events table
 * 
 * Payload:
 * {
 *   "eventType": "alttext_generated",
 *   "creditsDelta": -1,
 *   "metadata": {
 *     "imageCount": 5,
 *     "source": "plugin"
 *   }
 * }
 * 
 * Middleware: authenticateToken, optional checkSubscription (depending on event type)
 */
router.post('/log', authenticateToken, async (req, res) => {
  try {
    const { eventType, creditsDelta, metadata } = req.body;

    // Validate required fields
    if (!eventType) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'eventType is required',
      });
    }

    // Map JWT → identity_id
    // JWT contains identityId or id field
    let identityId = req.user?.identityId || req.user?.id;
    
    // If no identityId in JWT, try to get/create from email
    if (!identityId && req.user?.email) {
      const identityResult = await creditsService.getOrCreateIdentity(req.user.email);
      if (identityResult.success) {
        identityId = identityResult.identityId;
      }
    }

    if (!identityId) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'Unable to determine identity_id from token',
      });
    }

    // Validate creditsDelta if provided
    const creditsDeltaValue = creditsDelta !== undefined ? parseInt(creditsDelta, 10) : 0;
    if (isNaN(creditsDeltaValue)) {
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'creditsDelta must be a valid integer',
      });
    }

    // For credit-consuming events, check subscription/credits
    // This is optional - some events don't require subscription check
    const creditConsumingEvents = ['alttext_generated', 'credit_used'];
    if (creditConsumingEvents.includes(eventType) && creditsDeltaValue < 0) {
      // Check if user has subscription or credits
      // This is a lightweight check - full enforcement happens in checkSubscription middleware
      const balanceResult = await eventService.getCreditBalance(identityId);
      const subscriptionCheck = req.subscriptionCheck || false; // Set by middleware if needed
      
      // If no subscription and no credits, return error
      if (!subscriptionCheck && (!balanceResult.success || balanceResult.balance <= 0)) {
        return res.status(402).json({
          ok: false,
          code: 'NO_ACCESS',
          reason: 'no_subscription',
          message: 'No active subscription found. Please subscribe to continue.',
        });
      }
    }

    // Log the event
    const result = await eventService.logEvent(
      identityId,
      eventType,
      creditsDeltaValue,
      metadata || {}
    );

    if (!result.success) {
      return res.status(500).json({
        ok: false,
        code: 'EVENT_LOG_ERROR',
        reason: 'server_error',
        message: result.error || 'Failed to log event',
      });
    }

    return res.status(200).json({
      ok: true,
      eventId: result.eventId,
    });
  } catch (error) {
    console.error('[Events] Error logging event:', error);
    return res.status(500).json({
      ok: false,
      code: 'EVENT_LOG_ERROR',
      reason: 'server_error',
      message: error.message || 'Failed to log event',
    });
  }
});

module.exports = router;

