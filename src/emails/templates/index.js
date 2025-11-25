/**
 * Email Templates
 * HTML template functions for all email types
 */

const { getEmailConfig } = require('../../config/emailConfig');

/**
 * Generate email footer HTML
 * @param {Object} config - Email config
 * @returns {string} Footer HTML
 */
function getEmailFooter(config) {
  const { brandName, supportEmail } = config;
  return `
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 30px;">
      You received this email because you use ${brandName}. Contact <a href="mailto:${supportEmail}" style="color: #667eea; text-decoration: none;">${supportEmail}</a> for help.
    </p>
    <p style="font-size: 11px; color: #d1d5db; text-align: center; margin-top: 10px;">
      Best regards,<br>The ${brandName} Team
    </p>
  `;
}

/**
 * Generate base email HTML structure
 * @param {Object} config - Email config
 * @param {string} headerTitle - Header title
 * @param {string} headerColor - Header gradient color (default: purple)
 * @param {string} content - Main content HTML
 * @returns {string} Complete email HTML
 */
function getBaseEmailHTML(config, headerTitle, headerColor = '667eea', content) {
  const { brandName } = config;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #${headerColor} 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">${headerTitle}</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    ${content}
    ${getEmailFooter(config)}
  </div>
</body>
</html>`;
}

/**
 * Welcome email for waitlist signups
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} [params.source] - Source of signup (plugin, website, etc.)
 * @returns {Object} Email content with subject, html, and text
 */
function welcomeWaitlistEmail({ email, source }) {
  const config = getEmailConfig();
  const { brandName, dashboardUrl } = config;

  const content = `
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>Thank you for joining the ${brandName} waitlist! We're excited to have you on board.</p>
    
    <div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #667eea;">🚀 What's Next:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li>We'll notify you when ${brandName} is available</li>
        <li>You'll get early access to new features</li>
        <li>Check out our dashboard: <a href="${dashboardUrl}" style="color: #667eea;">${dashboardUrl}</a></li>
      </ul>
    </div>
  `;

  const html = getBaseEmailHTML(config, `Welcome to ${brandName}! 🎉`, '667eea', content);

  const text = `
Welcome to ${brandName}! 🎉

Thank you for joining the ${brandName} waitlist! We're excited to have you on board.

What's Next:
- We'll notify you when ${brandName} is available
- You'll get early access to new features
- Check out our dashboard: ${dashboardUrl}

You received this email because you use ${brandName}. Contact ${config.supportEmail} for help.

Best regards,
The ${brandName} Team
  `.trim();

  return {
    subject: `Welcome to ${brandName}! 🎉`,
    html,
    text,
  };
}

/**
 * Welcome email for dashboard users
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @returns {Object} Email content with subject, html, and text
 */
function welcomeDashboardEmail({ email }) {
  const config = getEmailConfig();
  const { brandName, dashboardUrl } = config;

  const content = `
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>Welcome to ${brandName}! We're excited to help you get started.</p>
    
    <div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #667eea;">🚀 Get Started:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li>Access your dashboard: <a href="${dashboardUrl}" style="color: #667eea;">${dashboardUrl}</a></li>
        <li>Set up your first project</li>
        <li>Explore our features</li>
      </ul>
    </div>
  `;

  const html = getBaseEmailHTML(config, `Welcome to ${brandName}! 🎉`, '667eea', content);

  const text = `
Welcome to ${brandName}! 🎉

Welcome to ${brandName}! We're excited to help you get started.

Get Started:
- Access your dashboard: ${dashboardUrl}
- Set up your first project
- Explore our features

You received this email because you use ${brandName}. Contact ${config.supportEmail} for help.

Best regards,
The ${brandName} Team
  `.trim();

  return {
    subject: `Welcome to ${brandName}! 🎉`,
    html,
    text,
  };
}

/**
 * License activated email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.planName - Plan name (Pro, Agency, etc.)
 * @param {string} [params.siteUrl] - Site URL where license is activated
 * @returns {Object} Email content with subject, html, and text
 */
function licenseActivatedEmail({ email, planName, siteUrl }) {
  const config = getEmailConfig();
  const { brandName } = config;

  const content = `
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>Your ${planName} license has been activated${siteUrl ? ` for ${siteUrl}` : ''}!</p>
    
    <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #10b981;">✅ Your ${planName} Plan Includes:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li>Full access to all ${planName} features</li>
        <li>Priority support</li>
        <li>Advanced capabilities</li>
      </ul>
    </div>
    
    ${siteUrl ? `<p>Your license is now active on <strong>${siteUrl}</strong>. Start using ${brandName} right away!</p>` : ''}
  `;

  const html = getBaseEmailHTML(config, `Your ${planName} License is Active! 🎉`, '10b981', content);

  const text = `
Your ${planName} License is Active! 🎉

Your ${planName} license has been activated${siteUrl ? ` for ${siteUrl}` : ''}!

Your ${planName} Plan Includes:
- Full access to all ${planName} features
- Priority support
- Advanced capabilities

${siteUrl ? `Your license is now active on ${siteUrl}. Start using ${brandName} right away!` : ''}

You received this email because you use ${brandName}. Contact ${config.supportEmail} for help.

Best regards,
The ${brandName} Team
  `.trim();

  return {
    subject: `Your ${planName} License is Active! 🎉`,
    html,
    text,
  };
}

/**
 * Low credit warning email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} [params.siteUrl] - Site URL
 * @param {number} params.remainingCredits - Remaining credits
 * @param {string} [params.pluginName] - Plugin name
 * @returns {Object} Email content with subject, html, and text
 */
function lowCreditWarningEmail({ email, siteUrl, remainingCredits, pluginName }) {
  const config = getEmailConfig();
  const { brandName, dashboardUrl } = config;

  const content = `
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>You're running low on credits${pluginName ? ` for ${pluginName}` : ''}!</p>
    
    <div style="background: #fffbeb; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center;">
      <div style="font-size: 48px; font-weight: bold; color: #d97706; margin-bottom: 10px;">${remainingCredits}</div>
      <div style="font-size: 14px; color: #92400e;">Credits Remaining</div>
    </div>
    
    <p>Consider upgrading your plan to get more credits and avoid interruptions.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${dashboardUrl}/upgrade" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">Upgrade Now</a>
    </div>
  `;

  const html = getBaseEmailHTML(config, `Low Credit Warning ⚡`, 'f59e0b', content);

  const text = `
Low Credit Warning ⚡

You're running low on credits${pluginName ? ` for ${pluginName}` : ''}!

${remainingCredits} Credits Remaining

Consider upgrading your plan to get more credits and avoid interruptions.

Upgrade now: ${dashboardUrl}/upgrade

You received this email because you use ${brandName}. Contact ${config.supportEmail} for help.

Best regards,
The ${brandName} Team
  `.trim();

  return {
    subject: `Low Credit Warning - ${remainingCredits} Credits Remaining ⚡`,
    html,
    text,
  };
}

/**
 * Receipt email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {number} params.amount - Payment amount
 * @param {string} params.planName - Plan name
 * @param {string} [params.invoiceUrl] - Invoice URL
 * @returns {Object} Email content with subject, html, and text
 */
function receiptEmail({ email, amount, planName, invoiceUrl }) {
  const config = getEmailConfig();
  const { brandName } = config;

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

  const content = `
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>Thank you for your payment! Your receipt is below.</p>
    
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 25px 0;">
      <p style="margin: 0 0 10px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
      <p style="margin: 0 0 10px 0;"><strong>Plan:</strong> ${planName}</p>
      ${invoiceUrl ? `<p style="margin: 0;"><strong>Invoice:</strong> <a href="${invoiceUrl}" style="color: #667eea;">View Invoice</a></p>` : ''}
    </div>
    
    <p>Your ${planName} plan is now active!</p>
  `;

  const html = getBaseEmailHTML(config, `Payment Receipt`, '10b981', content);

  const text = `
Payment Receipt

Thank you for your payment! Your receipt is below.

Amount: ${formattedAmount}
Plan: ${planName}
${invoiceUrl ? `Invoice: ${invoiceUrl}` : ''}

Your ${planName} plan is now active!

You received this email because you use ${brandName}. Contact ${config.supportEmail} for help.

Best regards,
The ${brandName} Team
  `.trim();

  return {
    subject: `Payment Receipt - ${formattedAmount}`,
    html,
    text,
  };
}

/**
 * Plugin signup email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.pluginName - Plugin name
 * @param {string} [params.siteUrl] - Site URL
 * @returns {Object} Email content with subject, html, and text
 */
function pluginSignupEmail({ email, pluginName, siteUrl }) {
  const config = getEmailConfig();
  const { brandName, dashboardUrl } = config;

  const content = `
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>Thank you for installing <strong>${pluginName}</strong>${siteUrl ? ` on ${siteUrl}` : ''}!</p>
    
    <div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #667eea;">🚀 Quick Start:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li>Your plugin is now active and ready to use</li>
        <li>Access your dashboard: <a href="${dashboardUrl}" style="color: #667eea;">${dashboardUrl}</a></li>
        <li>Check out our documentation for setup guides</li>
      </ul>
    </div>
  `;

  const html = getBaseEmailHTML(config, `Welcome to ${pluginName}! 🎉`, '667eea', content);

  const text = `
Welcome to ${pluginName}! 🎉

Thank you for installing ${pluginName}${siteUrl ? ` on ${siteUrl}` : ''}!

Quick Start:
- Your plugin is now active and ready to use
- Access your dashboard: ${dashboardUrl}
- Check out our documentation for setup guides

You received this email because you use ${brandName}. Contact ${config.supportEmail} for help.

Best regards,
The ${brandName} Team
  `.trim();

  return {
    subject: `Welcome to ${pluginName}! 🎉`,
    html,
    text,
  };
}

module.exports = {
  welcomeWaitlistEmail,
  welcomeDashboardEmail,
  licenseActivatedEmail,
  lowCreditWarningEmail,
  receiptEmail,
  pluginSignupEmail,
};

