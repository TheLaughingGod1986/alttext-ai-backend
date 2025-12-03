const jwt = require('jsonwebtoken');
const { createLicenseMock, createLicenseSnapshot } = require('../mocks/createLicenseMock');

function createTestUser(overrides = {}) {
  return {
    id: overrides.id || 1,
    email: overrides.email || 'test@example.com',
    plan: overrides.plan || 'free',
    service: overrides.service || 'alttext-ai',
    tokensRemaining: overrides.tokensRemaining || 50,
    stripe_customer_id: overrides.stripe_customer_id || null,
    ...overrides
  };
}

function createTestToken(payload = {}) {
  // Use the same default as auth/jwt.js to ensure tokens are valid
  const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const tokenPayload = {
    id: payload.id || 1,
    email: payload.email || 'test@example.com',
    plan: payload.plan || 'free',
    ...payload
  };
  return jwt.sign(tokenPayload, secret, { expiresIn: '1h' });
}

function createTestLicense(overrides = {}) {
  // Use standardized license mock
  return createLicenseMock(overrides);
}

function createTestLicenseSnapshot(overrides = {}) {
  // Use standardized license snapshot
  return createLicenseSnapshot(overrides);
}

function waitForAsync(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reset environment variables to test defaults
 */
function resetTestEnvironment() {
  // Set test environment variables if not already set
  // Use the same default as auth/jwt.js to ensure tokens are valid
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'your-super-secret-jwt-key-change-in-production';
  }
  if (!process.env.JWT_EXPIRES_IN) {
    process.env.JWT_EXPIRES_IN = '1h';
  }
  if (!process.env.ALTTEXT_OPENAI_API_KEY) {
    process.env.ALTTEXT_OPENAI_API_KEY = 'test-openai-key';
  }
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = 'test-openai-key';
  }
  if (!process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL = 'https://app.test';
  }
}

module.exports = {
  createTestUser,
  createTestToken,
  createTestLicense,
  createTestLicenseSnapshot,
  waitForAsync,
  resetTestEnvironment
};

