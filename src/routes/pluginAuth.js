/**
 * Plugin Authentication Routes
 * Handles plugin-init, token refresh, and identity endpoints
 */

const express = require('express');
const router = express.Router();
const { pluginInitSchema } = require('../validation/pluginInitSchema');
const { getOrCreateIdentity, issueJwt, refreshJwt } = require('../services/identityService');
const { recordInstallation } = require('../services/pluginInstallationService');
const logger = require('../utils/logger');
const { errors: httpErrors } = require('../utils/http');

/**
 * POST /auth/plugin-init
 * Plugin initialization endpoint
 * Creates/gets identity, records installation (non-blocking), and issues JWT
 */
router.post('/auth/plugin-init', async (req, res) => {
  try {
    const validation = pluginInitSchema.safeParse(req.body);

    if (!validation.success) {
      return httpErrors.validationFailed(res, 'Request validation failed', validation.error.flatten());
    }

    const data = validation.data;

    // Get or create identity
    const identity = await getOrCreateIdentity(data.email, data.plugin, data.site);

    if (!identity) {
      logger.error('[PluginAuth] Identity creation failed', { email: data.email, plugin: data.plugin });
      return httpErrors.internalError(res, 'Failed to create or retrieve identity', { code: 'IDENTITY_CREATION_FAILED' });
    }

  // Record installation (non-blocking - don't wait for it)
  recordInstallation({
    email: data.email,
    plugin: data.plugin,
    site: data.site,
    version: data.version,
    wpVersion: data.wpVersion,
    phpVersion: data.phpVersion,
    language: data.language,
    timezone: data.timezone,
    installSource: 'plugin',
  }).catch((e) => {
    logger.error('Failed to record installation', {
      error: e.message,
      stack: e.stack,
      email: data.email,
      plugin: data.plugin
    });
  });

    // Issue JWT
    const token = issueJwt(identity);

    return res.status(200).json({
      ok: true,
      token,
      email: identity.email,
      plugin: identity.plugin_slug,
    });
  } catch (error) {
    logger.error('[PluginAuth] Error in plugin-init', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Failed to initialize plugin');
  }
});

/**
 * POST /auth/refresh-token
 * Refresh JWT token
 * Validates old token, checks version, and returns new token
 */
router.post('/auth/refresh-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return httpErrors.missingField(res, 'token');
    }

    const result = await refreshJwt(token);

    if (!result.success) {
      return httpErrors.invalidToken(res, result.message || 'Failed to refresh token');
    }

    return res.status(200).json({
      ok: true,
      token: result.token,
    });
  } catch (error) {
    logger.error('[PluginAuth] Error in refresh-token', {
      error: error.message,
      stack: error.stack
    });
    return httpErrors.internalError(res, error.message || 'Failed to refresh token');
  }
});

/**
 * GET /auth/plugin-me
 * Test endpoint to verify plugin authentication (no auth required)
 */
router.get('/auth/plugin-me', (req, res) => {
  return res.status(200).json({
    ok: true,
  });
});

module.exports = router;

