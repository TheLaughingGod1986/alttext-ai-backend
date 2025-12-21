const { validateLicense } = require('../services/license');
const logger = require('../lib/logger');
const jwt = require('jsonwebtoken');
const config = require('../../config/config');

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/license/validate',
  '/license/activate',
  '/license/deactivate',
  '/license/transfer',
  '/billing/plans'
];

/**
 * Attempt JWT (Bearer token) authentication
 * @param {Object} req - Express request object
 * @param {Object} supabase - Supabase client
 * @param {string} authHeader - Authorization header value
 * @returns {Promise<Object|null>} User object if authenticated, null otherwise
 */
async function tryJWTAuth(req, supabase, authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    logger.debug('[Auth] JWT validated', {
      user_id: decoded.user_id,
      email: decoded.email
    });

    // Fetch user from database
    const { data: user } = await supabase
      .from('licenses')
      .select('*')
      .eq('id', decoded.user_id)
      .single();

    if (user && user.status === 'active') {
      req.user = user;
      req.license = user; // Set license for quota tracking
      req.authMethod = 'jwt';
      return user;
    } else {
      logger.warn('[Auth] JWT user not found or inactive');
    }
  } catch (err) {
    logger.warn('[Auth] JWT validation failed', { error: err.message });
  }

  return null;
}

/**
 * Attempt license key authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} supabase - Supabase client
 * @param {string} licenseKey - License key from header
 * @returns {Promise<Object|null>} License object if authenticated, error response if invalid, null if no key
 */
async function tryLicenseAuth(req, res, supabase, licenseKey) {
  if (!licenseKey) {
    return null;
  }

  const result = await validateLicense(supabase, licenseKey);
  if (result.error) {
    logger.warn('[Auth] License validation failed', {
      error: result.error,
      message: result.message,
      licenseKeyPrefix: licenseKey.substring(0, 8)
    });
    res.status(result.status || 401).json({
      error: result.error,
      message: result.message || 'License validation failed',
      code: result.error
    });
    return { error: true }; // Signal to stop processing
  }

  logger.debug('[Auth] License validated', {
    plan: result.license?.plan,
    status: result.license?.status
  });
  req.license = result.license;
  req.authMethod = 'license';
  return result.license;
}

/**
 * Attempt API token authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} apiKey - API key from header
 * @returns {boolean|Object} True if authenticated, error object if invalid, false if no token
 */
function tryAPITokenAuth(req, res, apiKey) {
  const requiredToken = config.altApiToken;
  if (!requiredToken) {
    return false; // No API token configured
  }

  if (apiKey === requiredToken) {
    req.authMethod = 'api_token';
    return true;
  }

  res.status(401).json({
    error: 'INVALID_API_TOKEN',
    message: 'Invalid or missing API token'
  });
  return { error: true }; // Signal to stop processing
}

/**
 * Authentication middleware
 * Supports multiple auth methods: JWT, License Key, API Token
 * @param {Object} options - Middleware options
 * @param {Object} options.supabase - Supabase client
 * @returns {Function} Express middleware function
 */
function authMiddleware({ supabase }) {
  return async function validate(req, res, next) {
    // Skip auth for public paths
    if (PUBLIC_PATHS.includes(req.path)) {
      return next();
    }

    const licenseKey = req.header('X-License-Key');
    const authHeader = req.header('Authorization');
    const apiKey = req.header('X-API-Key');

    // Debug logging
    logger.debug('[Auth] Request headers', {
      'X-License-Key': licenseKey ? `${licenseKey.substring(0, 8)}...` : 'missing',
      'X-API-Key': apiKey ? 'present' : 'missing',
      'Authorization': authHeader ? 'present' : 'missing',
      path: req.path
    });

    // Try JWT authentication first (if Bearer token present)
    const jwtResult = await tryJWTAuth(req, supabase, authHeader);
    if (jwtResult) {
      return next();
    }

    // Try license key authentication
    const licenseResult = await tryLicenseAuth(req, res, supabase, licenseKey);
    if (licenseResult) {
      if (licenseResult.error) return; // Error response already sent
      return next();
    }

    // Try API token authentication
    const apiTokenResult = tryAPITokenAuth(req, res, apiKey);
    if (apiTokenResult === true) {
      return next();
    }
    if (apiTokenResult && apiTokenResult.error) {
      return; // Error response already sent
    }

    // No valid authentication found
    logger.warn('[Auth] No valid authentication provided', {
      path: req.path,
      method: req.method,
      headers: req.headers ? Object.keys(req.headers).filter(h =>
        h.toLowerCase().includes('license') ||
        h.toLowerCase().includes('api') ||
        h.toLowerCase().includes('auth')
      ) : []
    });

    return res.status(401).json({
      error: 'INVALID_LICENSE',
      message: 'License key required. Please send X-License-Key header with your license key.',
      hint: 'Check your plugin settings to ensure the license key is configured correctly.'
    });
  };
}

/**
 * Extract user information from request headers
 * @param {Object} req - Express request object
 * @returns {Object} User information object with user_id, user_email, and plugin_version
 */
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
