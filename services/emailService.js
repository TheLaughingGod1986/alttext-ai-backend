/**
 * Email Service for Marketing Automation
 * Integrates with Resend.com for subscriber management and transactional emails
 */

const { Resend } = require('resend');

class EmailService {
  constructor() {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.audienceId = process.env.RESEND_AUDIENCE_ID || null;
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'AltText AI <noreply@alttextai.com>';
  }

  /**
   * Subscribe user to email list
   * @param {Object} data - Subscriber data
   * @param {string} data.email - User's email
   * @param {string} [data.name] - User's name
   * @param {string} [data.plan] - User's plan (free, pro, agency)
   * @param {string} [data.install_id] - WordPress install ID
   * @param {number} [data.wp_user_id] - WordPress user ID
   * @param {string} [data.opt_in_date] - Date user opted in
   * @param {Object} [data.metadata] - Additional metadata
   * @returns {Promise<Object>}
   */
  async subscribe(data) {
    const { email, name, plan = 'free', install_id, wp_user_id, opt_in_date, metadata = {} } = data;

    if (!this.resend || !this.audienceId) {
      console.warn('⚠️  Resend not configured - subscriber not added to audience');
      return {
        success: false,
        error: 'Email service not configured',
        message: 'RESEND_API_KEY or RESEND_AUDIENCE_ID not set'
      };
    }

    try {
      console.log(`[Email Service] Subscribing ${email} to audience ${this.audienceId}`);

      // Create contact in Resend audience
      const contact = await this.resend.contacts.create({
        email,
        firstName: name || email.split('@')[0],
        audienceId: this.audienceId,
        unsubscribed: false
      });

      console.log(`✅ Subscriber added to Resend: ${email} (contact ID: ${contact.id})`);

      return {
        success: true,
        contact_id: contact.id,
        audience_id: this.audienceId,
        message: 'Subscriber added successfully'
      };
    } catch (error) {
      console.error('[Email Service] Subscribe error:', error);

      // Handle duplicate contact gracefully
      if (error.message && error.message.includes('already exists')) {
        console.log(`ℹ️  Contact ${email} already exists in audience`);
        return {
          success: true,
          message: 'Contact already exists',
          duplicate: true
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to subscribe user'
      };
    }
  }

  /**
   * Trigger email based on event type
   * @param {Object} data - Email trigger data
   * @param {string} data.email - Recipient email
   * @param {string} data.event_type - Event type (welcome, usage_70, usage_100, upgrade, inactive_30d)
   * @param {Object} [data.event_data] - Event-specific data
   * @param {string} [data.install_id] - WordPress install ID
   * @returns {Promise<Object>}
   */
  async triggerEmail(data) {
    const { email, event_type, event_data = {}, install_id } = data;

    if (!this.resend) {
      console.warn('⚠️  Resend not configured - email not sent');
      console.log(`📧 Would have sent ${event_type} email to ${email}`);
      return {
        success: false,
        error: 'Email service not configured',
        message: 'RESEND_API_KEY not set'
      };
    }

    try {
      console.log(`[Email Service] Triggering ${event_type} email to ${email}`);

      const emailConfig = this.getEmailConfig(event_type, event_data);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: emailConfig.subject,
        html: emailConfig.html,
        text: emailConfig.text
      });

      console.log(`✅ Email sent: ${event_type} to ${email} (ID: ${result.id})`);

      return {
        success: true,
        email_id: result.id,
        event_type,
        message: 'Email sent successfully'
      };
    } catch (error) {
      console.error('[Email Service] Trigger email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send email'
      };
    }
  }

  /**
   * Unsubscribe user from email list
   * @param {string} email - User's email
   * @returns {Promise<Object>}
   */
  async unsubscribe(email) {
    if (!this.resend || !this.audienceId) {
      console.warn('⚠️  Resend not configured - unsubscribe not processed');
      return {
        success: false,
        error: 'Email service not configured'
      };
    }

    try {
      console.log(`[Email Service] Unsubscribing ${email} from audience ${this.audienceId}`);

      // Remove contact from audience
      await this.resend.contacts.remove({
        email,
        audienceId: this.audienceId
      });

      console.log(`✅ Unsubscribed: ${email}`);

      return {
        success: true,
        message: 'Unsubscribed successfully'
      };
    } catch (error) {
      console.error('[Email Service] Unsubscribe error:', error);
      return {
        success: false,
        error: error.message || 'Failed to unsubscribe'
      };
    }
  }

  /**
   * Get email configuration for event type
   * @param {string} event_type - Event type
   * @param {Object} event_data - Event-specific data
   * @returns {Object} Email configuration with subject, html, and text
   */
  getEmailConfig(event_type, event_data = {}) {
    const configs = {
      welcome: {
        subject: 'Welcome to AltText AI! 🎉',
        html: this.getWelcomeEmailHTML(event_data),
        text: this.getWelcomeEmailText(event_data)
      },
      usage_70: {
        subject: 'You\'re 70% Through Your Free Plan! ⚡',
        html: this.getUsage70EmailHTML(event_data),
        text: this.getUsage70EmailText(event_data)
      },
      usage_100: {
        subject: 'You\'ve Reached Your Free Plan Limit 🚀',
        html: this.getUsage100EmailHTML(event_data),
        text: this.getUsage100EmailText(event_data)
      },
      upgrade: {
        subject: 'Thank You for Upgrading! 🎊',
        html: this.getUpgradeEmailHTML(event_data),
        text: this.getUpgradeEmailText(event_data)
      },
      inactive_30d: {
        subject: 'We Miss You! Come Back to AltText AI 💙',
        html: this.getInactiveEmailHTML(event_data),
        text: this.getInactiveEmailText(event_data)
      }
    };

    return configs[event_type] || {
      subject: 'AltText AI Update',
      html: '<p>Thank you for using AltText AI!</p>',
      text: 'Thank you for using AltText AI!'
    };
  }

  // ===== HTML Email Templates =====

  getWelcomeEmailHTML(data) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to AltText AI! 🎉</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>Thank you for signing up for <strong>AltText AI</strong>! We're excited to help you boost your SEO and make your website more accessible.</p>

    <div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #667eea;">🚀 Get Started:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li>Upload images to WordPress</li>
        <li>Alt text generates automatically</li>
        <li>Boost Google image search rankings</li>
        <li>Improve accessibility (WCAG compliant)</li>
      </ul>
    </div>

    <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #10b981;">✨ Your Free Plan Includes:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li><strong>50 AI generations per month</strong></li>
        <li>GPT-4o-mini AI model</li>
        <li>Automatic generation on upload</li>
        <li>Bulk processing</li>
        <li>Dashboard and analytics</li>
      </ul>
    </div>

    <p>Ready to optimize your images? Head to your WordPress dashboard and start generating alt text!</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 14px; color: #6b7280;">Need help? Check out our <a href="https://alttextai.com/docs" style="color: #667eea; text-decoration: none;">documentation</a> or reach out to support.</p>
    <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 30px;">Best regards,<br>The AltText AI Team</p>
  </div>
</body>
</html>`;
  }

  getUsage70EmailHTML(data) {
    const { used = 35, limit = 50, plan = 'free' } = data;
    const remaining = limit - used;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">You're 70% Through Your Free Plan! ⚡</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>You've used <strong>${used} of ${limit}</strong> AI generations this month. Only <strong>${remaining} remaining</strong>!</p>

    <div style="background: #fffbeb; border: 2px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center;">
      <div style="font-size: 48px; font-weight: bold; color: #d97706; margin-bottom: 10px;">${remaining}</div>
      <div style="font-size: 14px; color: #92400e;">Generations Remaining This Month</div>
    </div>

    <h3 style="color: #667eea; margin-top: 30px;">🚀 Need More? Upgrade to Pro!</h3>
    <ul style="color: #1e293b; line-height: 1.8;">
      <li><strong>1,000 generations per month</strong></li>
      <li>Priority processing</li>
      <li>Advanced AI models</li>
      <li>Priority support</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://alttextai.com/upgrade" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">Upgrade Now</a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">Best regards,<br>The AltText AI Team</p>
  </div>
</body>
</html>`;
  }

  getUsage100EmailHTML(data) {
    const { limit = 50, plan = 'free', reset_date } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">You've Reached Your Free Plan Limit 🚀</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>You've used all <strong>${limit} AI generations</strong> included in your free plan this month. Great job optimizing your images!</p>

    <div style="background: #fef2f2; border: 2px solid #f87171; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center;">
      <div style="font-size: 48px; font-weight: bold; color: #dc2626; margin-bottom: 10px;">0</div>
      <div style="font-size: 14px; color: #991b1b;">Generations Remaining</div>
      ${reset_date ? `<div style="font-size: 12px; color: #b91c1c; margin-top: 10px;">Resets: ${reset_date}</div>` : ''}
    </div>

    <h3 style="color: #667eea; margin-top: 30px;">💎 Unlock Unlimited Potential with Pro!</h3>
    <ul style="color: #1e293b; line-height: 1.8;">
      <li><strong>1,000 generations per month</strong> (20x more!)</li>
      <li>Never run out again</li>
      <li>Advanced AI models for better results</li>
      <li>Priority processing & support</li>
    </ul>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://alttextai.com/upgrade" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">Upgrade to Pro Now</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">Or wait until next month when your free plan resets.</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">Best regards,<br>The AltText AI Team</p>
  </div>
</body>
</html>`;
  }

  getUpgradeEmailHTML(data) {
    const { plan = 'pro', plan_name = 'Pro' } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Thank You for Upgrading! 🎊</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-top: 0;">Welcome to AltText AI ${plan_name}!</p>
    <p>Thank you for upgrading! You now have access to premium features and significantly more AI generations.</p>

    <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #10b981;">🎁 Your ${plan_name} Plan Includes:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li><strong>${plan === 'agency' ? '10,000' : '1,000'} AI generations per month</strong></li>
        <li>Advanced AI models for better accuracy</li>
        <li>Priority processing</li>
        <li>Priority email support</li>
        <li>Early access to new features</li>
      </ul>
    </div>

    <div style="background: #eff6ff; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center;">
      <p style="margin: 0; font-size: 18px; color: #1e40af;">🚀 <strong>Your new limits are active now!</strong></p>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #3b82f6;">Start generating alt text right away</p>
    </div>

    <p>Head to your WordPress dashboard to start taking full advantage of your upgraded plan!</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 14px; color: #6b7280;">Questions? Reach out to our priority support team anytime.</p>
    <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 30px;">Best regards,<br>The AltText AI Team</p>
  </div>
</body>
</html>`;
  }

  getInactiveEmailHTML(data) {
    const { days_inactive = 30 } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">We Miss You! Come Back to AltText AI 💙</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; margin-top: 0;">Hi there!</p>
    <p>We noticed you haven't used AltText AI in the last ${days_inactive} days. We'd love to help you get back to optimizing your images!</p>

    <div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 20px; margin: 25px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #667eea;">🎯 Quick Wins with AltText AI:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
        <li>Rank higher in Google Image Search</li>
        <li>Make your site more accessible</li>
        <li>Save hours of manual work</li>
        <li>Improve SEO with zero effort</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://alttextai.com/login" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">Log In Now</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; text-align: center;">Your free plan is still active and ready to use!</p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 14px; color: #6b7280;">Need help getting started? Our support team is here for you.</p>
    <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 30px;">Best regards,<br>The AltText AI Team</p>
    <p style="font-size: 11px; color: #d1d5db; text-align: center; margin-top: 20px;">
      <a href="https://alttextai.com/unsubscribe" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
  }

  // ===== Plain Text Email Templates =====

  getWelcomeEmailText(data) {
    return `
Welcome to AltText AI! 🎉

Thank you for signing up! We're excited to help you boost your SEO and make your website more accessible.

Get Started:
- Upload images to WordPress
- Alt text generates automatically
- Boost Google image search rankings
- Improve accessibility (WCAG compliant)

Your Free Plan Includes:
- 50 AI generations per month
- GPT-4o-mini AI model
- Automatic generation on upload
- Bulk processing
- Dashboard and analytics

Ready to optimize your images? Head to your WordPress dashboard and start generating alt text!

Need help? Check out our documentation at https://alttextai.com/docs

Best regards,
The AltText AI Team
    `.trim();
  }

  getUsage70EmailText(data) {
    const { used = 35, limit = 50 } = data;
    const remaining = limit - used;

    return `
You're 70% Through Your Free Plan! ⚡

You've used ${used} of ${limit} AI generations this month. Only ${remaining} remaining!

Need More? Upgrade to Pro!
- 1,000 generations per month
- Priority processing
- Advanced AI models
- Priority support

Upgrade now: https://alttextai.com/upgrade

Best regards,
The AltText AI Team
    `.trim();
  }

  getUsage100EmailText(data) {
    const { limit = 50, reset_date } = data;

    return `
You've Reached Your Free Plan Limit 🚀

You've used all ${limit} AI generations included in your free plan this month. Great job optimizing your images!

Unlock Unlimited Potential with Pro!
- 1,000 generations per month (20x more!)
- Never run out again
- Advanced AI models
- Priority support

Upgrade now: https://alttextai.com/upgrade

${reset_date ? `Your free plan resets: ${reset_date}` : 'Or wait until next month when your free plan resets.'}

Best regards,
The AltText AI Team
    `.trim();
  }

  getUpgradeEmailText(data) {
    const { plan = 'pro', plan_name = 'Pro' } = data;

    return `
Thank You for Upgrading! 🎊

Welcome to AltText AI ${plan_name}!

Your ${plan_name} Plan Includes:
- ${plan === 'agency' ? '10,000' : '1,000'} AI generations per month
- Advanced AI models
- Priority processing
- Priority email support
- Early access to new features

Your new limits are active now! Start generating alt text right away.

Head to your WordPress dashboard to take full advantage of your upgraded plan!

Best regards,
The AltText AI Team
    `.trim();
  }

  getInactiveEmailText(data) {
    const { days_inactive = 30 } = data;

    return `
We Miss You! Come Back to AltText AI 💙

We noticed you haven't used AltText AI in the last ${days_inactive} days. We'd love to help you get back to optimizing your images!

Quick Wins with AltText AI:
- Rank higher in Google Image Search
- Make your site more accessible
- Save hours of manual work
- Improve SEO with zero effort

Log in now: https://alttextai.com/login

Your free plan is still active and ready to use!

Need help? Our support team is here for you.

Best regards,
The AltText AI Team

Unsubscribe: https://alttextai.com/unsubscribe
    `.trim();
  }

  /**
   * Send license key email to agency customer
   * @param {Object} data - License email data
   * @param {string} data.email - Customer email
   * @param {string} data.name - Customer name
   * @param {string} data.licenseKey - Generated license key
   * @param {string} data.plan - Plan name (agency)
   * @param {number} data.maxSites - Maximum number of sites allowed
   * @param {number} data.monthlyQuota - Monthly generation quota
   * @returns {Promise<Object>}
   */
  async sendLicenseKey(data) {
    const { email, name, licenseKey, plan = 'agency', maxSites = 10, monthlyQuota = 10000 } = data;

    if (!this.resend) {
      console.warn('⚠️  Resend not configured - license email not sent');
      console.log(`📧 Would have sent license key to ${email}: ${licenseKey}`);
      return {
        success: false,
        error: 'Email service not configured',
        message: 'RESEND_API_KEY not set'
      };
    }

    try {
      console.log(`[Email Service] Sending license key email to ${email}`);

      const emailHtml = this.getLicenseEmailHtml(data);
      const emailText = this.getLicenseEmailText(data);

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: `🎉 Your AltText AI ${plan.charAt(0).toUpperCase() + plan.slice(1)} License Key`,
        html: emailHtml,
        text: emailText
      });

      console.log(`✅ License key email sent to ${email} (email ID: ${result.id})`);

      return {
        success: true,
        email_id: result.id,
        message: 'License key email sent successfully'
      };
    } catch (error) {
      console.error('[Email Service] License email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send license email'
      };
    }
  }

  getLicenseEmailHtml(data) {
    const { name, licenseKey, plan = 'agency', maxSites = 10, monthlyQuota = 10000 } = data;
    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e1e4e8; border-top: none; border-radius: 0 0 10px 10px; }
    .license-key { background: #f6f8fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #667eea; word-break: break-all; }
    .features { background: #f6f8fa; border-left: 4px solid #667eea; padding: 15px 20px; margin: 20px 0; }
    .features ul { margin: 10px 0; padding-left: 20px; }
    .button { display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; margin: 10px 0; font-weight: 600; }
    .steps { counter-reset: step-counter; }
    .step { counter-increment: step-counter; margin: 15px 0; padding-left: 40px; position: relative; }
    .step:before { content: counter(step-counter); position: absolute; left: 0; top: 0; background: #667eea; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e4e8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">🎉 Your AltText AI ${planName} License</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Welcome to the team!</p>
    </div>

    <div class="content">
      <p>Hi ${name || 'there'},</p>

      <p>Thank you for upgrading to AltText AI ${planName}! Your license is ready to use.</p>

      <h2 style="color: #667eea; margin-top: 30px;">Your License Key</h2>
      <div class="license-key">${licenseKey}</div>
      <p style="text-align: center; font-size: 14px; color: #666;">Copy this key - you'll need it to activate your sites</p>

      <div class="features">
        <h3 style="margin-top: 0; color: #667eea;">Your ${planName} Plan Includes:</h3>
        <ul>
          <li><strong>${monthlyQuota.toLocaleString()} AI generations</strong> per month</li>
          <li><strong>Use on up to ${maxSites} sites</strong></li>
          <li><strong>Shared quota</strong> across all sites</li>
          <li><strong>Self-service site management</strong></li>
          <li><strong>Priority support</strong></li>
        </ul>
      </div>

      <h2 style="color: #667eea; margin-top: 30px;">Activation Instructions</h2>
      <div class="steps">
        <div class="step">
          <strong>Log into your WordPress admin panel</strong><br>
          <span style="color: #666;">Go to any site where you want to use AltText AI</span>
        </div>
        <div class="step">
          <strong>Navigate to AltText AI → License tab</strong><br>
          <span style="color: #666;">You'll find this in your WordPress dashboard menu</span>
        </div>
        <div class="step">
          <strong>Paste your license key</strong><br>
          <span style="color: #666;">Copy the key above and paste it in the activation form</span>
        </div>
        <div class="step">
          <strong>Click "Activate License"</strong><br>
          <span style="color: #666;">Your site will be activated instantly!</span>
        </div>
      </div>

      <p style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <strong>💡 Pro Tip:</strong> You can use the same license key on all ${maxSites} of your sites. They'll all share the ${monthlyQuota.toLocaleString()} monthly generation quota.
      </p>

      <p>Your quota is active now! Start generating professional alt text for all your client sites.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://docs.alttextai.com/license" class="button">View Full Documentation</a>
      </div>

      <h3 style="color: #667eea;">Need Help?</h3>
      <p>We're here to support you:</p>
      <ul>
        <li>📖 <a href="https://docs.alttextai.com" style="color: #667eea;">Documentation</a></li>
        <li>💬 <a href="https://alttextai.com/support" style="color: #667eea;">Contact Support</a></li>
        <li>📧 Reply to this email with any questions</li>
      </ul>

      <p style="margin-top: 30px;">Best regards,<br>The AltText AI Team</p>
    </div>

    <div class="footer">
      <p>AltText AI - Professional Alt Text for WordPress</p>
      <p>This email contains your license key. Please save it in a secure location.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  getLicenseEmailText(data) {
    const { name, licenseKey, plan = 'agency', maxSites = 10, monthlyQuota = 10000 } = data;
    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);

    return `
Your AltText AI ${planName} License Key

Hi ${name || 'there'},

Thank you for upgrading to AltText AI ${planName}! Your license is ready to use.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR LICENSE KEY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${licenseKey}

(Copy this key - you'll need it to activate your sites)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your ${planName} Plan Includes:
- ${monthlyQuota.toLocaleString()} AI generations per month
- Use on up to ${maxSites} sites
- Shared quota across all sites
- Self-service site management
- Priority support

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVATION INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Log into your WordPress admin panel
   (Go to any site where you want to use AltText AI)

2. Navigate to AltText AI → License tab
   (You'll find this in your WordPress dashboard menu)

3. Paste your license key
   (Copy the key above and paste it in the activation form)

4. Click "Activate License"
   (Your site will be activated instantly!)

💡 Pro Tip: You can use the same license key on all ${maxSites} of your sites. They'll all share the ${monthlyQuota.toLocaleString()} monthly generation quota.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your quota is active now! Start generating professional alt text for all your client sites.

Need Help?
- Documentation: https://docs.alttextai.com
- Support: https://alttextai.com/support
- Reply to this email with any questions

Best regards,
The AltText AI Team

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This email contains your license key. Please save it in a secure location.
    `.trim();
  }

  /**
   * Send license issued email (for all plans including free)
   * @param {Object} data - License email data
   * @param {string} data.email - Recipient email
   * @param {string} data.name - Recipient name
   * @param {string} data.licenseKey - License key
   * @param {string} data.plan - Plan name (free, pro, agency)
   * @param {number} data.tokenLimit - Token limit for the plan
   * @param {number} data.tokensRemaining - Tokens remaining
   * @param {string} [data.siteUrl] - Site URL if already attached
   * @param {boolean} [data.isAttached] - Whether license is already attached to a site
   * @returns {Promise<Object>}
   */
  async sendLicenseIssuedEmail(data) {
    const {
      email,
      name,
      licenseKey,
      plan = 'free',
      tokenLimit = 50,
      tokensRemaining = 50,
      siteUrl = null,
      isAttached = false
    } = data;

    if (!this.resend) {
      console.warn('⚠️  Resend not configured - license issued email not sent');
      console.log(`📧 Would have sent license issued email to ${email}: ${licenseKey}`);
      return {
        success: false,
        error: 'Email service not configured',
        message: 'RESEND_API_KEY not set'
      };
    }

    try {
      console.log(`[Email Service] Sending license issued email to ${email}`);

      const emailHtml = this.getLicenseIssuedEmailHtml(data);
      const emailText = this.getLicenseIssuedEmailText(data);

      const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
      const subject = `🎉 Your AltText AI ${planName} License Key`;

      const result = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject,
        html: emailHtml,
        text: emailText
      });

      console.log(`✅ License issued email sent to ${email} (email ID: ${result.id})`);

      return {
        success: true,
        email_id: result.id,
        message: 'License issued email sent successfully'
      };
    } catch (error) {
      console.error('[Email Service] License issued email error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send license issued email'
      };
    }
  }

  getLicenseIssuedEmailHtml(data) {
    const {
      name,
      licenseKey,
      plan = 'free',
      tokenLimit = 50,
      tokensRemaining = 50,
      siteUrl = null,
      isAttached = false
    } = data;

    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
    const maxSites = plan === 'agency' ? 10 : 1;

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e1e4e8; border-top: none; border-radius: 0 0 10px 10px; }
    .license-key { background: #f6f8fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #667eea; word-break: break-all; }
    .features { background: #f6f8fa; border-left: 4px solid #667eea; padding: 15px 20px; margin: 20px 0; }
    .features ul { margin: 10px 0; padding-left: 20px; }
    .button { display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; margin: 10px 0; font-weight: 600; }
    .steps { counter-reset: step-counter; }
    .step { counter-increment: step-counter; margin: 15px 0; padding-left: 40px; position: relative; }
    .step:before { content: counter(step-counter); position: absolute; left: 0; top: 0; background: #667eea; color: white; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: bold; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e1e4e8; }
    .attached-notice { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">🎉 Your AltText AI ${planName} License</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Your license is ready!</p>
    </div>

    <div class="content">
      <p>Hi ${name || 'there'},</p>

      <p>Thank you for signing up for AltText AI ${planName}! Your license has been created and is ready to use.</p>

      ${isAttached && siteUrl ? `
      <div class="attached-notice">
        <strong>✅ Already Attached</strong><br>
        Your license is already attached to: <strong>${siteUrl}</strong><br>
        You can start using AltText AI right away!
      </div>
      ` : ''}

      <h2 style="color: #667eea; margin-top: 30px;">Your License Key</h2>
      <div class="license-key">${licenseKey}</div>
      <p style="text-align: center; font-size: 14px; color: #666;">Copy this key - you'll need it to activate your sites</p>

      <div class="features">
        <h3 style="margin-top: 0; color: #667eea;">Your ${planName} Plan Includes:</h3>
        <ul>
          <li><strong>${tokenLimit.toLocaleString()} AI generations</strong> per month</li>
          <li><strong>${tokensRemaining.toLocaleString()} remaining</strong> this period</li>
          ${plan === 'agency' ? `<li><strong>Use on up to ${maxSites} sites</strong></li>` : ''}
          <li><strong>Automatic generation</strong> on image upload</li>
          <li><strong>Bulk processing</strong> support</li>
        </ul>
      </div>

      ${!isAttached ? `
      <h2 style="color: #667eea; margin-top: 30px;">Activation Instructions</h2>
      <div class="steps">
        <div class="step">
          <strong>Log into your WordPress admin panel</strong><br>
          <span style="color: #666;">Go to any site where you want to use AltText AI</span>
        </div>
        <div class="step">
          <strong>Navigate to AltText AI → License tab</strong><br>
          <span style="color: #666;">You'll find this in your WordPress dashboard menu</span>
        </div>
        <div class="step">
          <strong>Paste your license key</strong><br>
          <span style="color: #666;">Copy the key above and paste it in the activation form</span>
        </div>
        <div class="step">
          <strong>Click "Activate License"</strong><br>
          <span style="color: #666;">Your site will be activated instantly!</span>
        </div>
      </div>
      ` : ''}

      <p style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <strong>💡 Pro Tip:</strong> ${plan === 'agency' ? `You can use the same license key on all ${maxSites} of your sites. They'll all share the ${tokenLimit.toLocaleString()} monthly generation quota.` : 'Your license is tied to your account and works automatically on your WordPress site.'}
      </p>

      <p>Your quota is active now! Start generating professional alt text for your images.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="https://docs.alttextai.com/license" class="button">View Full Documentation</a>
      </div>

      <h3 style="color: #667eea;">Need Help?</h3>
      <p>We're here to support you:</p>
      <ul>
        <li>📖 <a href="https://docs.alttextai.com" style="color: #667eea;">Documentation</a></li>
        <li>💬 <a href="https://alttextai.com/support" style="color: #667eea;">Contact Support</a></li>
        <li>📧 Reply to this email with any questions</li>
      </ul>

      <p style="margin-top: 30px;">Best regards,<br>The AltText AI Team</p>
    </div>

    <div class="footer">
      <p>AltText AI - Professional Alt Text for WordPress</p>
      <p>This email contains your license key. Please save it in a secure location.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  getLicenseIssuedEmailText(data) {
    const {
      name,
      licenseKey,
      plan = 'free',
      tokenLimit = 50,
      tokensRemaining = 50,
      siteUrl = null,
      isAttached = false
    } = data;

    const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
    const maxSites = plan === 'agency' ? 10 : 1;

    return `
Your AltText AI ${planName} License Key

Hi ${name || 'there'},

Thank you for signing up for AltText AI ${planName}! Your license has been created and is ready to use.

${isAttached && siteUrl ? `
✅ Already Attached
Your license is already attached to: ${siteUrl}
You can start using AltText AI right away!

` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR LICENSE KEY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${licenseKey}

(Copy this key - you'll need it to activate your sites)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your ${planName} Plan Includes:
- ${tokenLimit.toLocaleString()} AI generations per month
- ${tokensRemaining.toLocaleString()} remaining this period
${plan === 'agency' ? `- Use on up to ${maxSites} sites\n` : ''}- Automatic generation on image upload
- Bulk processing support

${!isAttached ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVATION INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Log into your WordPress admin panel
   (Go to any site where you want to use AltText AI)

2. Navigate to AltText AI → License tab
   (You'll find this in your WordPress dashboard menu)

3. Paste your license key
   (Copy the key above and paste it in the activation form)

4. Click "Activate License"
   (Your site will be activated instantly!)

` : ''}

💡 Pro Tip: ${plan === 'agency' ? `You can use the same license key on all ${maxSites} of your sites. They'll all share the ${tokenLimit.toLocaleString()} monthly generation quota.` : 'Your license is tied to your account and works automatically on your WordPress site.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your quota is active now! Start generating professional alt text for your images.

Need Help?
- Documentation: https://docs.alttextai.com
- Support: https://alttextai.com/support
- Reply to this email with any questions

Best regards,
The AltText AI Team

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This email contains your license key. Please save it in a secure location.
    `.trim();
  }
}

module.exports = new EmailService();
module.exports.EmailService = EmailService;
