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
  return result.success;
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail
};
