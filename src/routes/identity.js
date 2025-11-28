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
 * Creates or gets identity, links installation if provided, updates last_seen_at
 * 
 * Payload:
 * - email (required)
 * - plugin (optional, plugin only)
 * - site (optional)
 * - installationId (optional)
 * 
 * Returns lightweight profile: { ok: true, identityId, email }
 */
router.post('/sync', async (req, res) => {
  try {
    // Validate payload with Zod
    const validation = identitySyncSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        error: 'VALIDATION_ERROR',
        details: validation.error.flatten(),
      });
    }

    const { email, installationId } = validation.data;

    // Get or create identity
    const { identityId } = await identityService.getOrCreateIdentity(email);

    // If installationId is provided, link it to the identity
    if (installationId) {
      try {
        await identityService.linkRecordToIdentity({
          table: 'plugin_installations',
          recordId: installationId,
          identityId,
        });
      } catch (linkError) {
        // Log error but don't fail the request - identity sync succeeded
        console.error('[IdentityRoutes] Error linking installation to identity:', linkError);
      }
    }

    // Return lightweight profile
    return res.json({
      ok: true,
      identityId,
      email: identityService.normalizeEmail(email),
    });
  } catch (error) {
    console.error('[IdentityRoutes] Error in /identity/sync:', error);
    return res.status(500).json({
      ok: false,
      error: 'SYNC_ERROR',
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

