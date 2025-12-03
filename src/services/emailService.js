/**
 * Email Service
 * Single entry point for all outgoing emails
 * Uses Resend client and React Email templates with HTML fallback
 */

const { getEnv } = require('../../config/loadEnv');
const { sendEmail } = require('../utils/resendClient');
const { billingFromEmail } = require('../emails/emailConfig');
const { hasRecentEvent, hasRecentEventForPlugin, logEvent } = require('./emailEventService');
const { recordInstallation } = require('./pluginInstallationService');
const analyticsService = require('./analyticsService');
const logger = require('../utils/logger');

// Try to load React Email render helper (may fail if templates not compiled)
let emailRenderHelper = null;
try {
  emailRenderHelper = require('../emails/renderHelper');
} catch (error) {
  logger.warn('[EmailService] React Email templates not available, using HTML templates');
}

// Fallback to HTML templates if React Email is not available
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
    logger.info(`[EmailService] Waitlist welcome email deduped for ${email}`, { email, reason: 'recent event exists' });
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
      logger.error(`[EmailService] Failed to send waitlist welcome email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] Waitlist welcome email sent`, { email });
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
    logger.error(`[EmailService] Exception sending waitlist welcome email`, { email, error: error.message });
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
    logger.info(`[EmailService] Dashboard welcome email deduped for ${email}`, { email, reason: 'recent event exists' });
    await logEvent({
      email,
      eventType,
      context: { deduped: true },
      success: true,
    });
    return { success: true, deduped: true };
  }

  try {
    // Try React Email template first, fallback to HTML
    let html, text, subject;
    if (emailRenderHelper && emailRenderHelper.renderWelcomeEmail) {
      try {
        const rendered = await emailRenderHelper.renderWelcomeEmail({ name: email.split('@')[0] });
        if (rendered) {
          html = rendered.html;
          text = rendered.text;
          subject = `Welcome to ${emailRenderHelper.getBrandName()}! 🎉`;
        }
      } catch (error) {
        logger.warn('[EmailService] Failed to render React Email template, using HTML fallback', { error: error.message });
      }
    }
    
    // Fallback to HTML template
    if (!html) {
      const template = welcomeDashboardEmail({ email });
      html = template.html;
      text = template.text;
      subject = template.subject;
    }

    const tags = [
      { name: 'event', value: 'dashboard_welcome' },
    ];

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
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
      logger.error(`[EmailService] Failed to send dashboard welcome email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    // Log analytics event (background - don't block email sending)
    analyticsService.logEventBackground({
      email,
      eventName: 'welcome_sent',
      source: 'server',
      eventData: { success: result.success },
    });

    logger.info(`[EmailService] Dashboard welcome email sent`, { email });
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
    logger.error(`[EmailService] Exception sending dashboard welcome email`, { email, error: error.message });
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send license issued email (with license key)
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} [params.name] - Recipient name
 * @param {string} params.licenseKey - License key to include in email
 * @param {string} params.plan - Plan name (pro, agency, free)
 * @param {number} [params.tokenLimit] - Token limit
 * @param {number} [params.tokensRemaining] - Tokens remaining
 * @param {string} [params.siteUrl] - Site URL where license is attached
 * @param {boolean} [params.isAttached] - Whether license is already attached
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendLicenseIssuedEmail({ email, name, licenseKey, plan = 'free', tokenLimit = 50, tokensRemaining = 50, siteUrl = null, isAttached = false }) {
  const eventType = 'license_issued';
  
  try {
    // Try React Email template first, fallback to HTML
    let html, text, subject;
    if (emailRenderHelper && emailRenderHelper.renderLicenseIssuedEmail) {
      try {
        const rendered = await emailRenderHelper.renderLicenseIssuedEmail({
          name: name || email.split('@')[0],
          licenseKey,
          plan: plan.toLowerCase(),
          tokenLimit,
          tokensRemaining,
          siteUrl,
          isAttached,
        });
        if (rendered) {
          html = rendered.html;
          text = rendered.text;
          const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
          subject = `🎉 Your AltText AI ${planName} License Key`;
        }
      } catch (error) {
        logger.warn('[EmailService] Failed to render React Email template, using HTML fallback', { error: error.message });
      }
    }
    
    // Fallback to HTML template (use licenseActivated template as base, but we need licenseKey)
    if (!html) {
      // For now, use licenseActivated template and add licenseKey info
      const template = licenseActivatedEmail({ email, planName: plan, siteUrl });
      html = template.html;
      text = template.text;
      const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
      subject = `🎉 Your AltText AI ${planName} License Key`;
      
      // Inject license key into HTML (simple approach)
      html = html.replace('</h1>', `</h1><div style="background: #f6f8fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #667eea; word-break: break-all;">${licenseKey}</div>`);
      text = `${text}\n\nYour License Key: ${licenseKey}`;
    }

    const tags = [
      { name: 'event', value: 'license_issued' },
      { name: 'plan', value: plan.toLowerCase() },
    ];

    if (siteUrl) {
      tags.push({ name: 'site_url', value: siteUrl });
    }

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
      tags,
    });

    // Log event (success or failure)
    await logEvent({
      email,
      eventType,
      context: { plan, licenseKey, siteUrl, isAttached },
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      logger.error(`[EmailService] Failed to send license issued email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] License issued email sent`, { email });
    return { success: true, email_id: result.id, emailId: result.id };
  } catch (error) {
    // Log exception
    await logEvent({
      email,
      eventType,
      context: { plan, licenseKey, siteUrl, isAttached },
      success: false,
      errorMessage: error.message,
    });
    logger.error(`[EmailService] Exception sending license issued email`, { email, error: error.message });
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send welcome email (compatibility wrapper)
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} [params.name] - Recipient name
 * @param {string} [params.plugin] - Plugin name
 * @param {Object} [params.metadata] - Additional metadata
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendWelcomeEmail({ email, name, plugin, metadata = {} }) {
  // Map to sendWaitlistWelcome if plugin provided, otherwise sendDashboardWelcome
  if (plugin) {
    return sendWaitlistWelcome({ email, plugin, source: metadata.source || 'plugin' });
  } else {
    return sendDashboardWelcome({ email });
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
    // Try React Email template first, fallback to HTML
    let html, text, subject;
    if (emailRenderHelper && emailRenderHelper.renderLicenseActivatedEmail) {
      try {
        // Map plan name to token limits (defaults)
        const tokenLimits = {
          'pro': 1000,
          'agency': 5000,
          'free': 50,
        };
        const tokenLimit = tokenLimits[planName.toLowerCase()] || 1000;
        
        const rendered = await emailRenderHelper.renderLicenseActivatedEmail({
          licenseKey: 'N/A', // Not provided in current API
          plan: planName.toLowerCase(),
          tokenLimit,
          tokensRemaining: tokenLimit, // Assume full limit on activation
          siteUrl,
          isAttached: !!siteUrl,
        });
        if (rendered) {
          html = rendered.html;
          text = rendered.text;
          subject = `${planName} License Activated - ${emailRenderHelper.getBrandName()}`;
        }
      } catch (error) {
        logger.warn('[EmailService] Failed to render React Email template, using HTML fallback', { error: error.message });
      }
    }
    
    // Fallback to HTML template
    if (!html) {
      const template = licenseActivatedEmail({ email, planName, siteUrl });
      html = template.html;
      text = template.text;
      subject = template.subject;
    }

    const tags = [
      { name: 'event', value: 'license_activated' },
      { name: 'plan', value: planName.toLowerCase() },
    ];

    if (siteUrl) {
      tags.push({ name: 'site_url', value: siteUrl });
    }

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
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
      logger.error(`[EmailService] Failed to send license activated email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] License activated email sent`, { email });
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
    logger.error(`[EmailService] Exception sending license activated email`, { email, error: error.message });
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
    // Try React Email template first, fallback to HTML
    let html, text, subject;
    if (emailRenderHelper && emailRenderHelper.renderLowCreditWarningEmail && remainingCredits !== undefined) {
      try {
        // Estimate limit based on remaining credits (assume 70% threshold means ~30% remaining)
        // If remainingCredits is provided, estimate total limit
        const estimatedLimit = Math.round(remainingCredits / 0.3); // Rough estimate
        const estimatedUsed = estimatedLimit - remainingCredits;
        
        const rendered = await emailRenderHelper.renderLowCreditWarningEmail({
          used: estimatedUsed,
          limit: estimatedLimit,
          plan: 'free', // Default
          resetDate: null, // Not provided in current API
        });
        if (rendered) {
          html = rendered.html;
          text = rendered.text;
          subject = `Low Credits Warning - ${emailRenderHelper.getBrandName()}`;
        }
      } catch (error) {
        logger.warn('[EmailService] Failed to render React Email template, using HTML fallback', { error: error.message });
      }
    }
    
    // Fallback to HTML template
    if (!html) {
      const template = lowCreditWarningEmail({ email, siteUrl, remainingCredits, pluginName });
      html = template.html;
      text = template.text;
      subject = template.subject;
    }

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
      subject,
      html,
      text,
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
      logger.error(`[EmailService] Failed to send low credit warning`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] Low credit warning sent`, { email });
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
    logger.error(`[EmailService] Exception sending low credit warning`, { email, error: error.message });
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
    // Try React Email template first, fallback to HTML
    let html, text, subject;
    if (emailRenderHelper && emailRenderHelper.renderReceiptEmail) {
      try {
        const rendered = await emailRenderHelper.renderReceiptEmail({
          amount,
          currency: 'USD', // Default
          plan: planName.toLowerCase(),
          transactionId: invoiceUrl ? 'See invoice' : 'N/A', // Use invoice URL as reference
          date: new Date().toISOString(),
        });
        if (rendered) {
          html = rendered.html;
          text = rendered.text;
          subject = `Receipt for ${planName} - ${emailRenderHelper.getBrandName()}`;
        }
      } catch (error) {
        logger.warn('[EmailService] Failed to render React Email template, using HTML fallback', { error: error.message });
      }
    }
    
    // Fallback to HTML template
    if (!html) {
      const template = receiptEmail({ email, amount, planName, invoiceUrl });
      html = template.html;
      text = template.text;
      subject = template.subject;
    }

    const normalizedPlan = (planName || 'unknown').toLowerCase();
    const tags = [
      { name: 'event', value: 'receipt' },
      { name: 'plan', value: normalizedPlan },
    ];

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
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
      logger.error(`[EmailService] Failed to send receipt email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] Receipt email sent`, { email });
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
    logger.error(`[EmailService] Exception sending receipt email`, { email, error: error.message });
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
async function sendPluginSignup({ email, pluginName, siteUrl, meta = {} }) {
  const eventType = 'plugin_signup';
  
  // Check for recent event (de-duplication) - 10 minute window per email+plugin
  const hasRecent = await hasRecentEventForPlugin({ 
    email, 
    pluginSlug: pluginName, 
    eventType, 
    windowMinutes: 10 
  });
  
  if (hasRecent) {
    logger.info(`[EmailService] Plugin signup email deduped`, { email, pluginName, reason: 'recent event exists' });
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
    // Try React Email template first, fallback to HTML
    let html, text, subject;
    if (emailRenderHelper && emailRenderHelper.renderPluginSignupEmail) {
      try {
        const rendered = await emailRenderHelper.renderPluginSignupEmail({
          plugin: pluginName,
          installId: meta?.installId || undefined,
        });
        if (rendered) {
          html = rendered.html;
          text = rendered.text;
          subject = `Welcome to ${pluginName}! 🎉`;
        }
      } catch (error) {
        logger.warn('[EmailService] Failed to render React Email template, using HTML fallback', { error: error.message });
      }
    }
    
    // Fallback to HTML template
    if (!html) {
      const template = pluginSignupEmail({ email, pluginName, siteUrl });
      html = template.html;
      text = template.text;
      subject = template.subject;
    }

    const tags = [
      { name: 'event', value: 'plugin_signup' },
      { name: 'plugin', value: pluginName },
    ];

    if (siteUrl) {
      tags.push({ name: 'site_url', value: siteUrl });
    }

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
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

    // Log analytics event (background - don't block email sending)
    analyticsService.logEventBackground({
      email,
      eventName: 'plugin_signup_sent',
      plugin: pluginName,
      source: 'server',
      eventData: { siteUrl, success: result.success },
    });

    if (!result.success) {
      logger.error(`[EmailService] Failed to send plugin signup email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    // Record plugin installation (non-blocking, don't fail email if this fails)
    recordInstallation({
      email,
      plugin: pluginName,
      site: siteUrl,
      version: meta?.version,
      wpVersion: meta?.wpVersion,
      phpVersion: meta?.phpVersion,
      language: meta?.language,
      timezone: meta?.timezone,
      installSource: meta?.installSource || 'plugin',
    }).catch(err => {
      logger.error('[EmailService] Failed to record plugin installation (non-critical)', { error: err.message });
      // Don't throw - installation recording failure shouldn't break email sending
    });

    logger.info(`[EmailService] Plugin signup email sent`, { email });
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
    logger.error(`[EmailService] Exception sending plugin signup email`, { email, error: error.message });
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
  const audienceId = getEnv('RESEND_AUDIENCE_ID');
  const apiKey = getEnv('RESEND_API_KEY');

  if (!apiKey || !audienceId) {
    logger.warn('[EmailService] Resend not configured - subscriber not added to audience');
    return {
      success: false,
      error: 'Email service not configured',
      message: 'RESEND_API_KEY or RESEND_AUDIENCE_ID not set',
    };
  }

  try {
    const resend = new Resend(apiKey);
    logger.info(`[EmailService] Subscribing to audience`, { email, audienceId });

    // Create contact in Resend audience
    const contact = await resend.contacts.create({
      email,
      firstName: name || email.split('@')[0],
      audienceId,
      unsubscribed: false,
    });

    logger.info(`Subscriber added to Resend`, { email, contactId: contact.id });

    return {
      success: true,
      contact_id: contact.id,
      audience_id: audienceId,
      message: 'Subscriber added successfully',
    };
  } catch (error) {
    logger.error('[EmailService] Subscribe error', { email, error: error.message });

    // Handle duplicate contact gracefully
    if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate'))) {
      logger.info(`Contact already exists in audience`, { email });
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
    // Try React Email template first, fallback to HTML
    let html, text, subject;
    if (emailRenderHelper && emailRenderHelper.renderPasswordResetEmail) {
      try {
        const rendered = await emailRenderHelper.renderPasswordResetEmail({
          resetUrl,
        });
        if (rendered) {
          html = rendered.html;
          text = rendered.text;
          subject = `Reset Your ${emailRenderHelper.getBrandName()} Password`;
        }
      } catch (error) {
        logger.warn('[EmailService] Failed to render React Email template, using HTML fallback', { error: error.message });
      }
    }
    
    // Fallback to HTML template
    if (!html) {
      const template = passwordResetEmail({ email, resetUrl });
      html = template.html;
      text = template.text;
      subject = template.subject;
    }

    const tags = [
      { name: 'event', value: 'password_reset' },
    ];

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
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
      logger.error(`[EmailService] Failed to send password reset email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] Password reset email sent`, { email });
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
    logger.error(`[EmailService] Exception sending password reset email`, { email, error: error.message });
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
      logger.error(`[EmailService] Failed to send usage summary email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] Usage summary email sent`, { email });
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
    logger.error(`[EmailService] Exception sending usage summary email`, { email, error: error.message });
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

/**
 * Send magic link email for authentication
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.token - Magic link token
 * @param {string} [params.redirectUrl] - Redirect URL after verification
 * @returns {Promise<Object>} Result with success and optional error
 */
async function sendMagicLink({ email, token, redirectUrl }) {
  const eventType = 'magic_link';
  
  // Check for recent event (de-duplication)
  const hasRecent = await hasRecentEvent({ email, eventType, windowMinutes: 5 });
  if (hasRecent) {
    logger.info(`[EmailService] Magic link email deduped`, { email, reason: 'recent event exists' });
    await logEvent({
      email,
      eventType,
      context: { deduped: true },
      success: true,
    });
    return { success: true, deduped: true };
  }

  try {
    // Build magic link URL
    const baseUrl = getEnv('FRONTEND_DASHBOARD_URL') || getEnv('FRONTEND_URL', 'http://localhost:3000');
    const verifyUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}${redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : ''}`;
    const brandName = getEnv('EMAIL_BRAND_NAME', 'AltText AI');

    // Simple HTML email template for magic link
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Sign in to ${brandName}</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; text-align: center;">
            <h1 style="color: #2c3e50; margin-bottom: 20px;">Sign in to ${brandName}</h1>
            <p style="color: #666; margin-bottom: 30px;">Click the button below to sign in to your account. This link will expire in 1 hour.</p>
            <a href="${verifyUrl}" style="display: inline-block; background: #007bff; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-bottom: 30px;">Sign in</a>
            <p style="color: #999; font-size: 14px; margin-top: 30px;">If you didn't request this link, you can safely ignore this email.</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">Or copy and paste this link into your browser:<br><a href="${verifyUrl}" style="color: #007bff; word-break: break-all;">${verifyUrl}</a></p>
          </div>
        </body>
      </html>
    `;

    const text = `Sign in to ${brandName}\n\nClick the link below to sign in to your account. This link will expire in 1 hour.\n\n${verifyUrl}\n\nIf you didn't request this link, you can safely ignore this email.`;

    const subject = `Sign in to ${brandName}`;

    const tags = [
      { name: 'event', value: 'magic_link' },
    ];

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
      tags,
    });

    // Log event (success or failure)
    await logEvent({
      email,
      eventType,
      context: { hasRedirect: !!redirectUrl },
      success: result.success,
      emailId: result.id,
      errorMessage: result.success ? null : result.error,
    });

    if (!result.success) {
      logger.error(`[EmailService] Failed to send magic link email`, { email, error: result.error });
      return { success: false, error: result.error };
    }

    logger.info(`[EmailService] Magic link email sent`, { email });
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
    logger.error(`[EmailService] Exception sending magic link email`, { email, error: error.message });
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

module.exports = {
  sendWaitlistWelcome,
  sendDashboardWelcome,
  sendLicenseActivated,
  sendLicenseIssuedEmail, // Added for compatibility with old service
  sendWelcomeEmail, // Added for compatibility with old service
  sendLowCreditWarning,
  sendReceipt,
  sendPluginSignup,
  sendPasswordReset,
  sendUsageSummary,
  subscribe,
  sendMagicLink,
};
