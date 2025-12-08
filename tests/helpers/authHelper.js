/**
 * Authentication helper for integration tests
 * Provides utilities to generate test JWT tokens for authenticated requests
 */

const { generateToken } = require('../../auth/jwt');

/**
 * Create a test auth token for integration tests
 * @param {Object} user - User object with id, email, plan
 * @returns {string} JWT token
 */
function createTestToken(user = {}) {
  const defaultUser = {
    id: 1,
    email: 'test@example.com',
    plan: 'free'
  };

  return generateToken({ ...defaultUser, ...user });
}

/**
 * Get authorization header for supertest requests
 * @param {Object} user - Optional user override
 * @returns {Object} Header object with Authorization
 */
function getAuthHeader(user) {
  const token = createTestToken(user);
  return {
    Authorization: `Bearer ${token}`
  };
}

module.exports = {
  createTestToken,
  getAuthHeader
};
