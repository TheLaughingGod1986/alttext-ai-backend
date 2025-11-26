/**
 * Email Service
 * Single entry point for all outgoing emails
 * Uses Resend client and email templates
 */

const { sendEmail } = require('../utils/resendClient');
const { billingFromEmail } = require('../emails/emailConfig');
const { hasRecentEvent, hasRecentEventForPlugin, logEvent } = require('./emailEventService');
const {
  welcomeWaitlistEmail,
  welcomeDashboardEmail,
  licenseActivatedEmail,
  lowCreditWarningEmail,
  receiptEmail,
  pluginSignupEmail,
  passwordResetEmail,
  usageSummaryEmail,
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
  const eventType = 'waitlist_welcome';
  
  // Check for recent event (de-duplication)
  const hasRecent = await hasRecentEvent({ email, eventType, windowMinutes: 60 });
  if (hasRecent) {
    console.log(`[EmailService] Waitlist welcome email deduped for ${email} (recent event exists)`);
    await logEvent({
      email,
      pluginSlug: plugin,
      eventType,
      context: { plugin, source, deduped: true },
      success: true,
    });
    return { success: true, deduped: true };
  }

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

    // Log event (success or failure)
    await logEvent({
      email,
      pluginSlug: plugin,
      eventType,
      context: { plugin, source },
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send waitlist welcome email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Waitlist welcome email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      pluginSlug: plugin,
      eventType,
      context: { plugin, source },
      success: false,
      errorMessage: error.message,
    });
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
  const eventType = 'dashboard_welcome';
  
  // Check for recent event (de-duplication)
  const hasRecent = await hasRecentEvent({ email, eventType, windowMinutes: 60 });
  if (hasRecent) {
    console.log(`[EmailService] Dashboard welcome email deduped for ${email} (recent event exists)`);
    await logEvent({
      email,
      eventType,
      context: { deduped: true },
      success: true,
    });
    return { success: true, deduped: true };
  }

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

    // Log event (success or failure)
    await logEvent({
      email,
      eventType,
      context: {},
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send dashboard welcome email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Dashboard welcome email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      eventType,
      context: {},
      success: false,
      errorMessage: error.message,
    });
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
  const eventType = 'license_activated';
  
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

    // Log event (success or failure)
    await logEvent({
      email,
      eventType,
      context: { planName, siteUrl },
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send license activated email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] License activated email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      eventType,
      context: { planName, siteUrl },
      success: false,
      errorMessage: error.message,
    });
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
  const eventType = 'low_credit_warning';
  
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

    // Log event (success or failure)
    await logEvent({
      email,
      pluginSlug: pluginName,
      eventType,
      context: { remainingCredits, siteUrl },
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send low credit warning to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Low credit warning sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      pluginSlug: pluginName,
      eventType,
      context: { remainingCredits, siteUrl },
      success: false,
      errorMessage: error.message,
    });
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
  const eventType = 'receipt';
  
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
      from: billingFromEmail, // Use billing from email for receipts
    });

    // Log event (success or failure)
    await logEvent({
      email,
      eventType,
      context: { amount, planName, invoiceUrl },
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send receipt email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Receipt email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      eventType,
      context: { amount, planName, invoiceUrl },
      success: false,
      errorMessage: error.message,
    });
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
  const eventType = 'plugin_signup';
  
  // Check for recent event (de-duplication) - 10 minute window per email+plugin
  const hasRecent = await hasRecentEventForPlugin({ 
    email, 
    pluginSlug: pluginName, 
    eventType, 
    windowMinutes: 10 
  });
  
  if (hasRecent) {
    console.log(`[EmailService] Plugin signup email deduped for ${email} with plugin ${pluginName} (recent event exists)`);
    await logEvent({
      email,
      pluginSlug: pluginName,
      eventType,
      context: { siteUrl, deduped: true },
      success: true,
    });
    return { success: true, deduped: true };
  }
  
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

    // Log event (success or failure)
    await logEvent({
      email,
      pluginSlug: pluginName,
      eventType,
      context: { siteUrl },
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send plugin signup email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Plugin signup email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      pluginSlug: pluginName,
      eventType,
      context: { siteUrl },
      success: false,
      errorMessage: error.message,
    });
    console.error(`[EmailService] Exception sending plugin signup email:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Subscribe user to Resend audience
 * @param {Object} params - Subscription parameters
 * @param {string} params.email - User's email
 * @param {string} [params.name] - User's name
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {Promise<Object>} Result with success and optional error
 */
async function subscribe({ email, name, metadata = {} }) {
  const { Resend } = require('resend');
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || !audienceId) {
    console.warn('[EmailService] Resend not configured - subscriber not added to audience');
    return {
      success: false,
      error: 'Email service not configured',
      message: 'RESEND_API_KEY or RESEND_AUDIENCE_ID not set',
    };
  }

  try {
    const resend = new Resend(apiKey);
    console.log(`[EmailService] Subscribing ${email} to audience ${audienceId}`);

    // Create contact in Resend audience
    const contact = await resend.contacts.create({
      email,
      firstName: name || email.split('@')[0],
      audienceId,
      unsubscribed: false,
    });

    console.log(`✅ Subscriber added to Resend: ${email} (contact ID: ${contact.id})`);

    return {
      success: true,
      contact_id: contact.id,
      audience_id: audienceId,
      message: 'Subscriber added successfully',
    };
  } catch (error) {
    console.error('[EmailService] Subscribe error:', error);

    // Handle duplicate contact gracefully
    if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
      console.log(`ℹ️  Contact ${email} already exists in audience`);
      return {
        success: true,
        message: 'Contact already exists',
        duplicate: true,
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to subscribe user',
    };
  }
}

/**
 * Send password reset email
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.resetUrl - Password reset URL with token
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendPasswordReset({ email, resetUrl }) {
  const eventType = 'password_reset';
  
  try {
    const template = passwordResetEmail({ email, resetUrl });
    const tags = [
      { name: 'event', value: 'password_reset' },
    ];

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    // Log event (success or failure)
    await logEvent({
      email,
      eventType,
      context: {}, // Don't log reset URL for security
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send password reset email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Password reset email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      eventType,
      context: {},
      success: false,
      errorMessage: error.message,
    });
    console.error(`[EmailService] Exception sending password reset email:`, error);
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send usage summary email (placeholder for future feature)
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} [params.pluginName] - Plugin name
 * @param {Object} [params.stats] - Usage statistics
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendUsageSummary({ email, pluginName, stats = {} }) {
  const eventType = 'usage_summary';
  
  try {
    const template = usageSummaryEmail({ email, pluginName, stats });
    const tags = [
      { name: 'event', value: 'usage_summary' },
    ];

    if (pluginName) {
      tags.push({ name: 'plugin', value: pluginName });
    }

    const result = await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      tags,
    });

    // Log event (success or failure)
    await logEvent({
      email,
      pluginSlug: pluginName,
      eventType,
      context: stats,
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      console.error(`[EmailService] Failed to send usage summary email to ${email}:`, result.error);
      return { success: false, error: result.error };
    }

    console.log(`[EmailService] Usage summary email sent to ${email}`);
    return { success: true, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      pluginSlug: pluginName,
      eventType,
      context: stats,
      success: false,
      errorMessage: error.message,
    });
    console.error(`[EmailService] Exception sending usage summary email:`, error);
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
  sendPasswordReset,
  sendUsageSummary,
  subscribe,
};
