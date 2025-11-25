/**
 * Email Configuration Helper
 * Centralizes email-related configuration from environment variables
 */

/**
 * Get email configuration from environment variables
 * @returns {Object} Email configuration object
 */
function getEmailConfig() {
  return {
    brandName: process.env.BRAND_NAME || process.env.EMAIL_BRAND_NAME || 'AltText AI',
    brandDomain: process.env.BRAND_DOMAIN || 'optti.dev',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@optti.dev',
    dashboardUrl: process.env.FRONTEND_DASHBOARD_URL || process.env.FRONTEND_URL || 'https://app.optti.dev',
    publicApiDomain: process.env.PUBLIC_API_DOMAIN || 'api.optti.dev',
    fromEmail: process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'AltText AI <noreply@alttextai.com>',
  };
}

module.exports = {
  getEmailConfig,
  // Export direct access to config for convenience
  get brandName() {
    return getEmailConfig().brandName;
  },
  get brandDomain() {
    return getEmailConfig().brandDomain;
  },
  get supportEmail() {
    return getEmailConfig().supportEmail;
  },
  get dashboardUrl() {
    return getEmailConfig().dashboardUrl;
  },
  get publicApiDomain() {
    return getEmailConfig().publicApiDomain;
  },
  get fromEmail() {
    return getEmailConfig().fromEmail;
  },
};

