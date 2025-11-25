/**
 * Email Service
 * Single entry point for all outgoing emails
 * Uses Resend client and email templates
 */

const { sendEmail } = require('../utils/resendClient');
const {
  welcomeWaitlistEmail,
  welcomeDashboardEmail,
  licenseActivatedEmail,
  lowCreditWarningEmail,
  receiptEmail,
  pluginSignupEmail,
} = require('../emails/templates');

/**
 * Send waitlist welcome email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} [params.plugin] - Plugin name
 * @param {string} [params.source] - Source of signup (plugin, website, etc.)
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendWaitlistWelcome({ email, plugin, source }) {
  try {
    const template = welcomeWaitlistEmail({ email, source });
    const tags = [
      { name: 'event', value: 'waitlist_signup' },
    ];

    if (plugin) {
      tags.push({ name: 'plugin', value: plugin });
    }
    if (source) {
      tags.push({ name: 'source', value: source });
    }

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send waitlist welcome email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Waitlist welcome email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error(`[EmailService] Exception sending waitlist welcome email:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send dashboard welcome email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendDashboardWelcome({ email }) {
  try {
    const template = welcomeDashboardEmail({ email });
    const tags = [
      { name: 'event', value: 'dashboard_welcome' },
    ];

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send dashboard welcome email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Dashboard welcome email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error(`[EmailService] Exception sending dashboard welcome email:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send license activated email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.planName - Plan name (Pro, Agency, etc.)
 * @param {string} [params.siteUrl] - Site URL where license is activated
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendLicenseActivated({ email, planName, siteUrl }) {
  try {
    const template = licenseActivatedEmail({ email, planName, siteUrl });
    const tags = [
      { name: 'event', value: 'license_activated' },
      { name: 'plan', value: planName.toLowerCase() },
    ];

    if (siteUrl) {
      tags.push({ name: 'site_url', value: siteUrl });
    }

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send license activated email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] License activated email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error(`[EmailService] Exception sending license activated email:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send low credit warning email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} [params.siteUrl] - Site URL
 * @param {number} params.remainingCredits - Remaining credits
 * @param {string} [params.pluginName] - Plugin name
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendLowCreditWarning({ email, siteUrl, remainingCredits, pluginName }) {
  try {
    const template = lowCreditWarningEmail({ email, siteUrl, remainingCredits, pluginName });
    const tags = [
      { name: 'event', value: 'low_credit_warning' },
    ];

    if (pluginName) {
      tags.push({ name: 'plugin', value: pluginName });
    }
    if (siteUrl) {
      tags.push({ name: 'site_url', value: siteUrl });
    }

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send low credit warning to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Low credit warning sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error(`[EmailService] Exception sending low credit warning:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send receipt email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {number} params.amount - Payment amount
 * @param {string} params.planName - Plan name
 * @param {string} [params.invoiceUrl] - Invoice URL
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendReceipt({ email, amount, planName, invoiceUrl }) {
  try {
    const normalizedPlan = (planName || 'unknown').toLowerCase();
    const template = receiptEmail({ email, amount, planName, invoiceUrl });
    const tags = [
      { name: 'event', value: 'receipt' },
      { name: 'plan', value: normalizedPlan },
    ];

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send receipt email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Receipt email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error(`[EmailService] Exception sending receipt email:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send plugin signup email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.pluginName - Plugin name
 * @param {string} [params.siteUrl] - Site URL
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendPluginSignup({ email, pluginName, siteUrl }) {
  try {
    const template = pluginSignupEmail({ email, pluginName, siteUrl });
    const tags = [
      { name: 'event', value: 'plugin_signup' },
      { name: 'plugin', value: pluginName },
    ];

    if (siteUrl) {
      tags.push({ name: 'site_url', value: siteUrl });
    }

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send plugin signup email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Plugin signup email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    console.error(`[EmailService] Exception sending plugin signup email:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

module.exports = {
  sendWaitlistWelcome,
  sendDashboardWelcome,
  sendLicenseActivated,
  sendLowCreditWarning,
  sendReceipt,
  sendPluginSignup,
};
