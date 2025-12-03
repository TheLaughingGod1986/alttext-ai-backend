/**
 * JWT Authentication utilities
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { getEnv, requireEnv } = require('../config/loadEnv');
const crypto = require('crypto');

const JWT_SECRET = getEnv('JWT_SECRET', 'your-super-secret-jwt-key-change-in-production');
const JWT_EXPIRES_IN = getEnv('JWT_EXPIRES_IN', '7d');
const REFRESH_TOKEN_EXPIRES_IN = getEnv('REFRESH_TOKEN_EXPIRES_IN', '30d');

/**
 * Generate JWT token for user
 * Supports both legacy user objects and identity-based objects
 */
function generateToken(user) {
  const payload = {
    id: user.id || user.identityId,
    identityId: user.identityId || user.id,
    email: user.email,
    plan: user.plan || 'free',
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Generate refresh token
 * Returns a cryptographically secure random token
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Verify refresh token (checks if token exists and is not expired)
 * @param {string} token - Refresh token
 * @param {Date} expiresAt} expiresAt - Expiration date
 * @returns {boolean} True if token is valid
 */
function verifyRefreshToken(token, expiresAt) {
  if (!token || !expiresAt) {
    return false;
  }
  
  const now = new Date();
  const expiration = new Date(expiresAt);
  
  return now < expiration;
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Hash password using bcrypt
 */
async function hashPassword(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare password with hash
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * JWT middleware for protecting routes
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'MISSING_TOKEN'
    });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ 
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = decoded;
    } catch (error) {
      // Ignore invalid tokens in optional auth
    }
  }
  
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  optionalAuth,
  generateRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_EXPIRES_IN,
};
