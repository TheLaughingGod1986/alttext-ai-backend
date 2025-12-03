/**
 * Identity Routes
 * Handles unified identity synchronization and profile retrieval
 */

const express = require('express');
const router = express.Router();
const { identitySyncSchema } = require('../validation/identitySchemas');
const identityService = require('../services/identityService');
const logger = require('../utils/logger');
const { errors: httpErrors } = require('../utils/http');

/**
 * POST /identity/sync
 * Synchronize identity - called by plugins + website
 * Upserts identity and plugin_installations, returns full updated identity
 * 
 * Payload:
 * - email (required)
 * - plugin (optional)
 * - site (optional)
 * - version (optional)
 * - wpVersion (optional)
 * - phpVersion (optional)
 * - installationId (optional, legacy support)
 * 
 * Returns full identity: { ok: true, identity: { id, email, installations: [...] } }
 */
router.post('/sync', async (req, res) => {
  try {
    // Validate payload with Zod
    const validation = identitySyncSchema.safeParse(req.body);

    if (!validation.success) {
      return httpErrors.validationFailed(res, 'Request validation failed', validation.error.flatten());
    }

    const { email, plugin, site, version, wpVersion, phpVersion } = validation.data;

    // Use syncIdentity method to handle full sync
    // This upserts identity and plugin_installations
    const syncResult = await identityService.syncIdentity({
      email,
      plugin,
      site,
      version,
      wpVersion,
      phpVersion,
        });

    if (!syncResult.success) {
      logger.error('[IdentityRoutes] Sync failed', {
        error: syncResult.error,
        email
      });
      return httpErrors.internalError(res, syncResult.error || 'Failed to sync identity', { code: 'SYNC_ERROR' });
    }

    // Return full updated identity with installations
    return res.json({
      ok: true,
      identity: syncResult.identity,
    });
  } catch (error) {
    logger.error('[IdentityRoutes] Error in /identity/sync', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Failed to sync identity', { code: 'SYNC_ERROR' });
  }
});

/**
 * GET /identity/me
 * Get full identity profile
 * 
 * Query params:
 * - identityId (required) - Identity UUID
 * 
 * Returns full profile with installations, subscriptions, usage summary, email events
 */
router.get('/me', async (req, res) => {
  try {
    const { identityId } = req.query;

    if (!identityId) {
      return httpErrors.missingField(res, 'identityId');
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(identityId)) {
      return httpErrors.invalidInput(res, 'identityId must be a valid UUID');
    }

    // Get full identity profile
    const profile = await identityService.getFullIdentityProfile(identityId);

    return res.json({
      ok: true,
      ...profile,
    });
  } catch (error) {
    logger.error('[IdentityRoutes] Error in /identity/me', {
      error: error.message,
      stack: error.stack,
      identityId: req.query.identityId
    });
    
    // Check if it's a "not found" error
    if (error.message && error.message.includes('not found')) {
      return httpErrors.notFound(res, 'Identity');
    }

    return httpErrors.internalError(res, error.message || 'Failed to get identity profile', { code: 'PROFILE_ERROR' });
  }
});

module.exports = router;

