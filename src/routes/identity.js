/**
 * Identity Routes
 * Handles unified identity synchronization and profile retrieval
 */

const express = require('express');
const router = express.Router();
const { identitySyncSchema } = require('../validation/identitySchemas');
const identityService = require('../services/identityService');

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
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        reason: 'validation_failed',
        message: 'Request validation failed',
        details: validation.error.flatten(),
      });
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
      return res.status(500).json({
        ok: false,
        code: 'SYNC_ERROR',
        reason: 'server_error',
        message: syncResult.error || 'Failed to sync identity',
      });
    }

    // Return full updated identity with installations
    return res.json({
      ok: true,
      identity: syncResult.identity,
    });
  } catch (error) {
    console.error('[IdentityRoutes] Error in /identity/sync:', error);
    return res.status(500).json({
      ok: false,
      code: 'SYNC_ERROR',
      reason: 'server_error',
      message: error.message || 'Failed to sync identity',
    });
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
      return res.status(400).json({
        ok: false,
        error: 'MISSING_IDENTITY_ID',
        message: 'identityId query parameter is required',
      });
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(identityId)) {
      return res.status(400).json({
        ok: false,
        error: 'INVALID_IDENTITY_ID',
        message: 'identityId must be a valid UUID',
      });
    }

    // Get full identity profile
    const profile = await identityService.getFullIdentityProfile(identityId);

    return res.json({
      ok: true,
      ...profile,
    });
  } catch (error) {
    console.error('[IdentityRoutes] Error in /identity/me:', error);
    
    // Check if it's a "not found" error
    if (error.message && error.message.includes('not found')) {
      return res.status(404).json({
        ok: false,
        error: 'IDENTITY_NOT_FOUND',
        message: error.message,
      });
    }

    return res.status(500).json({
      ok: false,
      error: 'PROFILE_ERROR',
      message: error.message || 'Failed to get identity profile',
    });
  }
});

module.exports = router;

