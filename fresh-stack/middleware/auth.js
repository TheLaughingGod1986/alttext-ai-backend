const { validateLicense } = require('../services/license');
const logger = require('../lib/logger');

function authMiddleware({ supabase }) {
  return async function validate(req, res, next) {
    const licenseKey = req.header('X-License-Key');
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace(/^Bearer\\s+/i, '');

    // Debug logging
    logger.debug('[Auth] Request headers', {
      'X-License-Key': licenseKey ? `${licenseKey.substring(0, 8)}...` : 'missing',
      'X-API-Key': apiKey ? 'present' : 'missing',
      'Authorization': req.header('Authorization') ? 'present' : 'missing',
      path: req.path
    });

    // License-based auth preferred
    if (licenseKey) {
      const result = await validateLicense(supabase, licenseKey);
      if (result.error) {
        logger.warn('[Auth] License validation failed', {
          error: result.error,
          message: result.message,
          licenseKeyPrefix: licenseKey.substring(0, 8)
        });
        return res.status(result.status || 401).json({
          error: result.error,
          message: result.message || 'License validation failed',
          code: result.error
        });
      }
      logger.debug('[Auth] License validated', {
        plan: result.license?.plan,
        status: result.license?.status
      });
      req.license = result.license;
      req.authMethod = 'license';
      return next();
    }

    // Fallback API token
    const requiredToken = process.env.ALT_API_TOKEN || process.env.API_TOKEN;
    if (requiredToken) {
      if (apiKey === requiredToken) {
        req.authMethod = 'api_token';
        return next();
      }
      return res.status(401).json({ error: 'INVALID_API_TOKEN', message: 'Invalid or missing API token' });
    }

    // Allow unauthenticated only if no token configured
    logger.warn('[Auth] No license key or API token provided', {
      path: req.path,
      method: req.method,
      headers: Object.keys(req.headers).filter(h => h.toLowerCase().includes('license') || h.toLowerCase().includes('api') || h.toLowerCase().includes('auth'))
    });
    return res.status(401).json({ 
      error: 'INVALID_LICENSE', 
      message: 'License key required. Please send X-License-Key header with your license key.',
      hint: 'Check your plugin settings to ensure the license key is configured correctly.'
    });
  };
}

function extractUserInfo(req) {
  return {
    user_id: req.header('X-WP-User-ID') || req.header('X-User-ID') || null,
    user_email: req.header('X-WP-User-Email') || req.header('X-User-Email') || null,
    plugin_version: req.header('X-Plugin-Version') || null
  };
}

module.exports = {
  authMiddleware,
  extractUserInfo
};
