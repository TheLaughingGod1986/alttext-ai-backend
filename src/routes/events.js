/**
 * Events Routes
 * Unified event logging endpoint
 * POST /events/log - Log an event to the unified events table
 */

const express = require('express');
const { authenticateToken } = require('../../auth/jwt');
const eventService = require('../services/eventService');
const creditsService = require('../services/creditsService');
const logger = require('../utils/logger');
const { errors: httpErrors } = require('../utils/http');

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
      return httpErrors.missingField(res, 'eventType');
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
      return httpErrors.validationFailed(res, 'Unable to determine identity_id from token');
    }

    // Validate creditsDelta if provided
    const creditsDeltaValue = creditsDelta !== undefined ? parseInt(creditsDelta, 10) : 0;
    if (isNaN(creditsDeltaValue)) {
      return httpErrors.invalidInput(res, 'creditsDelta must be a valid integer');
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
        return httpErrors.noAccess(res);
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
      logger.error('[Events] Failed to log event', {
        error: result.error,
        eventType,
        identityId
      });
      return httpErrors.internalError(res, result.error || 'Failed to log event', { code: 'EVENT_LOG_ERROR' });
    }

    return res.status(200).json({
      ok: true,
      eventId: result.eventId,
    });
  } catch (error) {
    logger.error('[Events] Error logging event', {
      error: error.message,
      stack: error.stack,
      eventType: req.body?.eventType,
      identityId: req.user?.identityId || req.user?.id
    });
    return httpErrors.internalError(res, error.message || 'Failed to log event', { code: 'EVENT_LOG_ERROR' });
  }
});

module.exports = router;

