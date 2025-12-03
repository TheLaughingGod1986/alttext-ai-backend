/**
 * Subscription Check Middleware for Partner API
 * Wraps the standard subscription check to work with partner API authentication
 * Extracts email from partner API key identity and sets req.user.email
 */

const { supabase } = require('../../db/supabase-client');
const requireSubscription = require('./requireSubscription');
const errorCodes = require('../constants/errorCodes');
const logger = require('../utils/logger');

/**
 * Middleware to check subscription for partner API requests
 * Extracts email from partner API key identity before calling standard subscription check
 */
async function checkSubscriptionForPartner(req, res, next) {
  try {
    // Partner API auth sets req.partnerApiKey with identityId
    if (!req.partnerApiKey || !req.partnerApiKey.identityId) {
      return res.status(401).json({
        ok: false,
        code: 'UNAUTHORIZED',
        reason: 'authentication_required',
        message: 'Partner API authentication required',
      });
    }

    // Get identity email from identityId
    const { data: identity, error: identityError } = await supabase
      .from('identities')
      .select('email')
      .eq('id', req.partnerApiKey.identityId)
      .single();

    if (identityError || !identity) {
      return res.status(500).json({
        ok: false,
        code: 'IDENTITY_ERROR',
        reason: 'server_error',
        message: 'Identity not found',
      });
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
    return res.status(500).json({
      ok: false,
      code: 'SERVER_ERROR',
      reason: 'server_error',
      message: 'Subscription check failed',
    });
  }
}

module.exports = checkSubscriptionForPartner;

