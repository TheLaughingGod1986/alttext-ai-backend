/**
 * Resend Client Wrapper
 * Provides a simple interface for sending emails via Resend
 */

const { Resend } = require('resend');
const { transactionalFromEmail } = require('../emails/emailConfig');
const { getEnv } = require('../../config/loadEnv');
const logger = require('../utils/logger');

let resendInstance = null;
let cachedApiKey = null;

/**
 * Initialize Resend client if API key is available
 */
function initResend() {
  const apiKey = getEnv('RESEND_API_KEY');
  
  // If API key changed or instance doesn't exist, recreate
  if (!resendInstance || cachedApiKey !== apiKey) {
    resendInstance = null;
    cachedApiKey = apiKey;
    if (apiKey) {
      resendInstance = new Resend(apiKey);
    }
  }
  
  return resendInstance;
}

/**
 * Send an email via Resend
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email content
 * @param {string} [options.text] - Plain text email content (optional)
 * @param {Array<{name: string, value: string}>} [options.tags] - Email tags for tracking
 * @param {string} [options.from] - Sender email address (defaults to EMAIL_FROM env var)
 * @returns {Promise<Object>} Resend API response with { id, error } or { success: false, error }
 */
async function sendEmail({ to, subject, html, text, tags = [], from = null }) {
  const client = initResend();

  if (!client) {
    const error = 'Resend API key not configured';
    logger.error('[Resend Client] Resend API key not configured');
    return {
      success: false,
      error,
    };
  }

  if (!to || !subject || !html) {
    const error = 'Missing required email fields: to, subject, and html are required';
    logger.error('[Resend Client] Missing required email fields', { to: !!to, subject: !!subject, html: !!html });
    return {
      success: false,
      error,
    };
  }

  try {
    logger.info('[Resend Client] Sending email', { to, subject });

    const emailData = {
      from: from || transactionalFromEmail,
      to,
      subject,
      html,
    };

    if (text) {
      emailData.text = text;
    }

    if (tags && tags.length > 0) {
      emailData.tags = tags;
    }

    const result = await client.emails.send(emailData);

    if (result.error) {
      logger.error('[Resend Client] Error sending email', {
        error: result.error.message || result.error,
        to,
        subject
      });
      return {
        success: false,
        error: result.error.message || 'Failed to send email',
        details: result.error,
      };
    }

    logger.info('[Resend Client] Email sent successfully', {
      emailId: result.data?.id || 'unknown',
      to
    });

    return {
      success: true,
      id: result.data?.id,
      data: result.data,
    };
  } catch (error) {
    logger.error('[Resend Client] Exception sending email', {
      error: error.message,
      stack: error.stack,
      to,
      subject
    });
    return {
      success: false,
      error: error.message || 'Failed to send email',
      details: error,
    };
  }
}

module.exports = {
  sendEmail,
  initResend,
};

