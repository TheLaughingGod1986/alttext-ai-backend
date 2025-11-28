/**
 * Plugin Authentication Routes
 * Handles plugin-init, token refresh, and identity endpoints
 */

const express = require('express');
const router = express.Router();
const { pluginInitSchema } = require('../validation/pluginInitSchema');
const { getOrCreateIdentity, issueJwt, refreshJwt } = require('../services/identityService');
const { recordInstallation } = require('../services/pluginInstallationService');

/**
 * POST /auth/plugin-init
 * Plugin initialization endpoint
 * Creates/gets identity, records installation (non-blocking), and issues JWT
 */
router.post('/auth/plugin-init', async (req, res) => {
  const validation = pluginInitSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      ok: false,
      error: 'VALIDATION_ERROR',
      details: validation.error.flatten(),
    });
  }

  const data = validation.data;

  // Get or create identity
  const identity = await getOrCreateIdentity(data.email, data.plugin, data.site);

  if (!identity) {
    return res.status(500).json({
      ok: false,
      error: 'IDENTITY_CREATION_FAILED',
    });
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
    console.error('Failed to record installation', e);
  });

  // Issue JWT
  const token = issueJwt(identity);

  return res.status(200).json({
    ok: true,
    token,
    email: identity.email,
    plugin: identity.plugin_slug,
  });
});

/**
 * POST /auth/refresh-token
 * Refresh JWT token
 * Validates old token, checks version, and returns new token
 */
router.post('/auth/refresh-token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      ok: false,
      error: 'TOKEN_REQUIRED',
    });
  }

  const result = await refreshJwt(token);

  if (!result.success) {
    return res.status(401).json({
      ok: false,
      ...result,
    });
  }

  return res.status(200).json({
    ok: true,
    token: result.token,
  });
});

/**
 * GET /auth/me
 * Test endpoint to verify authentication
 */
router.get('/auth/me', (req, res) => {
  return res.status(200).json({
    ok: true,
  });
});

module.exports = router;

