/**
 * Subscription Check Middleware for Partner API
 * Wraps the standard subscription check to work with partner API authentication
 * Extracts email from partner API key identity and sets req.user.email
 */

const { supabase } = require('../../db/supabase-client');
const requireSubscription = require('./requireSubscription');
const errorCodes = require('../constants/errorCodes');
const logger = require('../utils/logger');
const { errors: httpErrors } = require('../utils/http');

/**
 * Middleware to check subscription for partner API requests
 * Extracts email from partner API key identity before calling standard subscription check
 */
async function checkSubscriptionForPartner(req, res, next) {
  try {
    // Partner API auth sets req.partnerApiKey with identityId
    if (!req.partnerApiKey || !req.partnerApiKey.identityId) {
      return httpErrors.authenticationRequired(res, 'Partner API authentication required');
    }

    // Get identity email from identityId
    const { data: identity, error: identityError } = await supabase
      .from('identities')
      .select('email')
      .eq('id', req.partnerApiKey.identityId)
      .single();

    if (identityError || !identity) {
      logger.error('[CheckSubscriptionForPartner] Identity not found', {
        error: identityError?.message,
        identityId: req.partnerApiKey.identityId
      });
      return httpErrors.internalError(res, 'Identity not found', { code: 'IDENTITY_ERROR' });
    }

    // Set req.user.email so the standard subscription middleware can use it
    if (!req.user) {
      req.user = {};
    }
    req.user.email = identity.email;

    // Call the standard subscription check middleware
    return requireSubscription(req, res, next);
  } catch (error) {
    logger.error('[CheckSubscriptionForPartner] Exception in middleware', {
      error: error.message,
      stack: error.stack,
      identityId: req.partnerApiKey?.identityId
    });
    return httpErrors.internalError(res, 'Subscription check failed');
  }
}

module.exports = checkSubscriptionForPartner;

