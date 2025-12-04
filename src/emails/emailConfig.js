/**
 * Email Configuration Helper
 * Centralizes email-related configuration from environment variables
 */

/**
 * Get email configuration from environment variables
 * @returns {Object} Email configuration object
 */
function getEmailConfig() {
  // Get brand name from env vars
  const brandName = process.env.BRAND_NAME || process.env.EMAIL_BRAND_NAME || 'AltText AI';
  
  // Get brand domain from env var (default to 'optti.dev' for backward compatibility)
  const brandDomain = process.env.BRAND_DOMAIN || 'optti.dev';
  
  // Construct support email from domain if not provided
  const supportEmail = process.env.SUPPORT_EMAIL || `support@${brandDomain}`;
  
  // Construct dashboard URL from domain if not provided
  const dashboardUrl = process.env.FRONTEND_DASHBOARD_URL || 
    process.env.FRONTEND_URL || 
    `https://app.${brandDomain}`;
  
  // Construct API domain from brand domain if not provided
  const publicApiDomain = process.env.PUBLIC_API_DOMAIN || `api.${brandDomain}`;
  
  // Transactional from email (for general emails)
  const transactionalFromEmail = process.env.TRANSACTIONAL_FROM_EMAIL || 
    process.env.EMAIL_FROM || 
    process.env.RESEND_FROM_EMAIL || 
    `${brandName} <hello@${brandDomain}>`;
  
  // Billing from email (for receipts and payment-related emails)
  const billingFromEmail = process.env.BILLING_FROM_EMAIL || 
    process.env.EMAIL_FROM || 
    process.env.RESEND_FROM_EMAIL || 
    `${brandName} <billing@${brandDomain}>`;

  return {
    brandName,
    brandDomain,
    supportEmail,
    dashboardUrl,
    publicApiDomain,
    transactionalFromEmail,
    billingFromEmail,
  };
}

// Export plain object for direct property access
const emailConfig = {
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
  get transactionalFromEmail() {
    return getEmailConfig().transactionalFromEmail;
  },
  get billingFromEmail() {
    return getEmailConfig().billingFromEmail;
  },
};

// Also export the function for cases where full config object is needed
module.exports = {
  ...emailConfig,
  getEmailConfig,
};

