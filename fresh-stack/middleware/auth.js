const { validateLicense } = require('../services/license');

function authMiddleware({ supabase }) {
  return async function validate(req, res, next) {
    const licenseKey = req.header('X-License-Key');
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace(/^Bearer\\s+/i, '');

    // License-based auth preferred
    if (licenseKey) {
      const result = await validateLicense(supabase, licenseKey);
      if (result.error) {
        return res.status(result.status || 401).json({
          error: result.error,
          message: result.message || 'License validation failed',
          code: result.error
        });
      }
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
    return res.status(401).json({ error: 'INVALID_LICENSE', message: 'License key required' });
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
