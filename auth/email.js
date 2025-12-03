/**
 * Email service for password reset
 * 
 * @deprecated This file is deprecated. Use src/services/emailService instead.
 * 
 * Migration guide:
 * - sendPasswordResetEmail(email, resetUrl) → emailService.sendPasswordReset({ email, resetUrl })
 * - sendWelcomeEmail(email, username) → emailService.sendDashboardWelcome({ email })
 * 
 * This file is kept for backward compatibility with tests only.
 * Production code should use src/services/emailService.
 */

const logger = require('../src/utils/logger');

/**
 * Send password reset email
 * @deprecated Use emailService.sendPasswordReset() instead
 * @param {string} email - User's email address
 * @param {string} resetUrl - Password reset URL with token
 * @returns {Promise<boolean>}
 */
async function sendPasswordResetEmail(email, resetUrl) {
  const emailService = require('../src/services/emailService');
  const result = await emailService.sendPasswordReset({ email, resetUrl });

  // If email service is not configured, fall back to logger
  if (!result.success && result.error && result.error.includes('not configured')) {
    logger.info('[Auth Email] Password reset email fallback', { email, resetUrl });
    return true; // Return true for fallback behavior
  }

  return result.success;
}

/**
 * Send welcome email to new users
 * @deprecated Use emailService.sendDashboardWelcome() instead
 * @param {string} email - User's email address
 * @param {string} username - User's email (used as username)
 * @returns {Promise<boolean>}
 */
async function sendWelcomeEmail(email, username) {
  const emailService = require('../src/services/emailService');
  const result = await emailService.sendDashboardWelcome({ email });

  // If email service is not configured, fall back to logger
  if (!result.success && result.error && result.error.includes('not configured')) {
    logger.info('[Auth Email] Welcome email fallback', { email, username });
    return true; // Return true for fallback behavior
  }

  return result.success;
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail
};
