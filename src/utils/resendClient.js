/**
 * Resend Client Wrapper
 * Provides a simple interface for sending emails via Resend
 */

const { Resend } = require('resend');
const { fromEmail } = require('../config/emailConfig');

let resendInstance = null;

/**
 * Initialize Resend client if API key is available
 */
function initResend() {
  if (!resendInstance && process.env.RESEND_API_KEY) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
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
    console.error(`[Resend Client] ${error}`);
    return {
      success: false,
      error,
    };
  }

  if (!to || !subject || !html) {
    const error = 'Missing required email fields: to, subject, and html are required';
    console.error(`[Resend Client] ${error}`);
    return {
      success: false,
      error,
    };
  }

  try {
    console.log(`[Resend Client] Sending email to ${to} with subject: ${subject}`);

    const emailData = {
      from: from || fromEmail,
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
      console.error(`[Resend Client] Error sending email:`, result.error);
      return {
        success: false,
        error: result.error.message || 'Failed to send email',
        details: result.error,
      };
    }

    console.log(`[Resend Client] Email sent successfully. ID: ${result.data?.id || 'unknown'}`);

    return {
      success: true,
      id: result.data?.id,
      data: result.data,
    };
  } catch (error) {
    console.error(`[Resend Client] Exception sending email:`, error);
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

