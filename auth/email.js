/**
 * Email service for password reset
 * Supports multiple email providers via environment variables
 */

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} resetUrl - Password reset URL with token
 * @returns {Promise<boolean>}
 */
async function sendPasswordResetEmail(email, resetUrl) {
  // Debug: Log if API key is missing
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️  RESEND_API_KEY environment variable not found');
    console.warn('   Checking process.env keys:', Object.keys(process.env).filter(k => k.includes('RESEND')));
  }
  
  // Try Resend first (modern, simple, recommended)
  if (process.env.RESEND_API_KEY) {
    console.log('✅ RESEND_API_KEY found, attempting to send email via Resend...');
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'AltText AI <noreply@alttextai.com>',
        to: email,
        subject: 'Reset Your AltText AI Password',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Reset Your Password</h1>
              </div>
              <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p>You requested to reset your password for AltText AI.</p>
                <p>Click the button below to reset your password:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetUrl}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 600;">Reset Password</a>
                </div>
                <p style="font-size: 14px; color: #6b7280;">Or copy and paste this link into your browser:</p>
                <p style="font-size: 12px; word-break: break-all; color: #9ca3af; background: #f3f4f6; padding: 10px; border-radius: 4px;">${resetUrl}</p>
                <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">This link will expire in 1 hour.</p>
                <p style="font-size: 14px; color: #6b7280;">If you didn't request this, please ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                <p style="font-size: 12px; color: #9ca3af; text-align: center;">Best regards,<br>The AltText AI Team</p>
              </div>
            </body>
          </html>
        `,
        text: `
Password Reset Request

You requested to reset your password for AltText AI.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email.

Best regards,
AltText AI Team
        `.trim()
      });

      if (error) {
        console.error('❌ Resend email error:', JSON.stringify(error, null, 2));
        console.error('   Error details:', error);
        console.error('   Error code:', error?.message || error);
        
        // Common Resend errors
        if (error?.message?.includes('domain') || error?.message?.includes('verified')) {
          console.error('   ⚠️  Domain verification issue!');
          console.error('   💡 Try using: onboarding@resend.dev (test domain)');
          console.error('   💡 Or verify your domain in Resend dashboard');
        }
        if (error?.message?.includes('from') || error?.message?.includes('sender')) {
          console.error('   ⚠️  From email address issue!');
          console.error('   💡 Email address must be verified in Resend');
        }
        
        throw error;
      }

      console.log(`✅ Password reset email sent via Resend to ${email}`);
      console.log(`   Email ID: ${data?.id || 'unknown'}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email via Resend:', error.message || error);
      console.error('   Full error:', JSON.stringify(error, null, 2));
      // Fall through to try other services or fallback
    }
  }

  // Try SendGrid
  if (process.env.SENDGRID_API_KEY) {
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      await sgMail.send({
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@alttextai.com',
        subject: 'Reset Your AltText AI Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Reset Your Password</h2>
            <p>You requested to reset your password for AltText AI.</p>
            <p><a href="${resetUrl}" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p>
            <p style="font-size: 12px; color: #666;">Or copy this link: ${resetUrl}</p>
            <p style="font-size: 12px; color: #666;">This link expires in 1 hour.</p>
          </div>
        `,
        text: `Reset Your Password\n\nClick this link: ${resetUrl}\n\nThis link expires in 1 hour.`
      });

      console.log(`✅ Password reset email sent via SendGrid to ${email}`);
      return true;
    } catch (error) {
      console.error('Failed to send email via SendGrid:', error);
      // Fall through to fallback
    }
  }

  // Fallback: Log to console (development/testing)
  const emailBody = `
Password Reset Request

You requested to reset your password for AltText AI.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email.

Best regards,
AltText AI Team
  `.trim();

  console.log('\n===========================================');
  console.log('📧 PASSWORD RESET EMAIL (MOCKED - NO EMAIL SERVICE CONFIGURED)');
  console.log('===========================================');
  console.log(`To: ${email}`);
  console.log(`Subject: Reset Your AltText AI Password`);
  console.log('-------------------------------------------');
  console.log(emailBody);
  console.log('===========================================');
  console.log('\n⚠️  Email service not configured. To enable email sending:');
  console.log('   1. Set RESEND_API_KEY in environment variables (recommended)');
  console.log('   2. Or set SENDGRID_API_KEY in environment variables');
  console.log('   3. See backend/env.example for details\n');

  return true;
}

/**
 * Send welcome email to new users
 * @param {string} email - User's email address
 * @param {string} username - User's email (used as username)
 * @returns {Promise<boolean>}
 */
async function sendWelcomeEmail(email, username) {
  // Try Resend first
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      const { data, error } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'AltText AI <noreply@alttextai.com>',
        to: email,
        subject: 'Welcome to SEO AI Alt Text Generator! 🎉',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to SEO AI Alt Text Generator! 🎉</h1>
              </div>
              <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <p style="font-size: 16px;">Hi there!</p>
                <p>Thank you for signing up for <strong>SEO AI Alt Text Generator</strong>! We're excited to help you improve your website's SEO and accessibility.</p>
                
                <div style="background: #f0f9ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; font-weight: 600; color: #667eea;">🚀 Get Started:</p>
                  <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
                    <li>Upload images to WordPress</li>
                    <li>Alt text generates automatically</li>
                    <li>Boost Google image search rankings</li>
                    <li>Improve accessibility (WCAG compliant)</li>
                  </ul>
                </div>
                
                <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; font-weight: 600; color: #10b981;">✨ Your Free Plan Includes:</p>
                  <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e293b;">
                    <li><strong>50 AI generations per month</strong></li>
                    <li>GPT-4o-mini AI model</li>
                    <li>Automatic generation on upload</li>
                    <li>Bulk processing</li>
                    <li>Dashboard and analytics</li>
                  </ul>
                </div>
                
                <p>Ready to get started? Head to your WordPress dashboard and start optimizing your images!</p>
                
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                <p style="font-size: 14px; color: #6b7280;">Need help? Check out our <a href="https://alttextai.com/docs" style="color: #667eea;">documentation</a> or reach out to our support team.</p>
                <p style="font-size: 12px; color: #9ca3af; text-align: center; margin-top: 30px;">Best regards,<br>The SEO AI Alt Text Generator Team</p>
              </div>
            </body>
          </html>
        `,
        text: `
Welcome to SEO AI Alt Text Generator!

Thank you for signing up! We're excited to help you improve your website's SEO and accessibility.

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

Ready to get started? Head to your WordPress dashboard and start optimizing your images!

Need help? Check out our documentation at https://alttextai.com/docs

Best regards,
The SEO AI Alt Text Generator Team
        `.trim()
      });

      if (error) {
        console.error('Resend welcome email error:', error);
        throw error;
      }

      console.log(`✅ Welcome email sent via Resend to ${email}`);
      return true;
    } catch (error) {
      console.error('Failed to send welcome email via Resend:', error);
      // Fall through to fallback
    }
  }

  // Fallback: Log to console
  console.log('\n===========================================');
  console.log('📧 WELCOME EMAIL (MOCKED - NO EMAIL SERVICE CONFIGURED)');
  console.log('===========================================');
  console.log(`To: ${email}`);
  console.log(`Subject: Welcome to SEO AI Alt Text Generator! 🎉`);
  console.log('-------------------------------------------');
  console.log(`Welcome! Thank you for signing up.`);
  console.log('===========================================\n');

  return true;
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail
};
