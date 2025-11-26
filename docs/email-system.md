# Email System Documentation

## Overview

The backend email system is centralized and provides a single source of truth for all email functionality across Optti plugins and the website. All emails are sent via Resend and use configurable branding.

## Architecture

The email system consists of the following layers:

1. **Configuration** (`src/emails/emailConfig.js`) - Centralizes all email-related environment variables
2. **Templates** (`src/emails/templates/index.js`) - HTML email template functions
3. **Resend Client** (`src/utils/resendClient.js`) - Single gateway to Resend API
4. **Email Service** (`src/services/emailService.js`) - High-level semantic API for sending emails
5. **Email Event Service** (`src/services/emailEventService.js`) - Logging and de-duplication
6. **Routes** (`src/routes/email.js`) - Public API endpoints for plugins and website

## Configuration

All email configuration is centralized in `src/emails/emailConfig.js` and pulled from environment variables:

- `BRAND_NAME` - Brand name (defaults to "AltText AI")
- `BRAND_DOMAIN` - Brand domain (defaults to "optti.dev")
- `SUPPORT_EMAIL` - Support email address (defaults to `support@${BRAND_DOMAIN}`)
- `FRONTEND_DASHBOARD_URL` - Dashboard URL (defaults to `https://app.${BRAND_DOMAIN}`)
- `PUBLIC_API_DOMAIN` - Public API domain (defaults to `api.${BRAND_DOMAIN}`)
- `TRANSACTIONAL_FROM_EMAIL` - From email for general emails (defaults to `EMAIL_FROM`)
- `BILLING_FROM_EMAIL` - From email for receipts (defaults to `EMAIL_FROM`)

## Email Service Methods

The `emailService` provides the following methods:

### `sendWaitlistWelcome({ email, plugin, source })`
Sends welcome email to waitlist signups. Includes de-duplication (60-minute window).

### `sendDashboardWelcome({ email })`
Sends welcome email to new dashboard users. Includes de-duplication (60-minute window).

### `sendLicenseActivated({ email, planName, siteUrl })`
Sends email when a license is activated.

### `sendLowCreditWarning({ email, remainingCredits, pluginName, siteUrl })`
Sends warning when credits are running low.

### `sendReceipt({ email, amount, planName, invoiceUrl })`
Sends payment receipt email. Uses `billingFromEmail` as the from address.

### `sendPluginSignup({ email, pluginName, siteUrl })`
Sends email when a plugin is installed.

### `sendPasswordReset({ email, resetUrl })`
Sends password reset email with reset link.

### `sendUsageSummary({ email, pluginName, stats })`
Placeholder for future usage summary emails.

### `subscribe({ email, name, metadata })`
Subscribes user to Resend audience (for marketing emails).

## Public API Endpoints

All endpoints are under `/email` and require rate limiting (10 requests per 15 minutes per IP).

### `POST /email/waitlist`
Body: `{ email, plugin?, source? }`
- Sends waitlist welcome email
- No authentication required

### `POST /email/dashboard-welcome`
Body: `{ email }`
- Sends dashboard welcome email
- No authentication required

### `POST /email/plugin-signup`
Body: `{ email, pluginName, siteUrl? }`
- Sends plugin signup email
- No authentication required

### `POST /email/license-activated`
Body: `{ email, planName, siteUrl? }`
- Sends license activated email
- **Requires authentication** (JWT token)

### `POST /email/low-credit-warning`
Body: `{ email, remainingCredits, pluginName?, siteUrl? }`
- Sends low credit warning
- No authentication required (but should be called internally)

### `POST /email/receipt`
Body: `{ email, amount, planName, invoiceUrl?, pluginName? }`
- Sends payment receipt
- **Requires authentication** (JWT token)

## Email Event Logging

All email sends are logged to the `email_events` table in Supabase for:
- Audit trail
- De-duplication (prevents duplicate emails within time windows)
- Analytics

The `emailEventService` provides:
- `hasRecentEvent({ email, eventType, windowMinutes })` - Check for recent events
- `logEvent({ userId, email, pluginSlug, eventType, context, success, emailId, errorMessage })` - Log an event

## De-duplication

The following email types are de-duplicated (60-minute window):
- `waitlist_welcome`
- `dashboard_welcome`

If a recent event exists, the email is not sent and `{ success: true, deduped: true }` is returned.

## Internal Usage

For internal backend code, import and use `emailService` directly:

```javascript
const emailService = require('./src/services/emailService');

// Send welcome email
await emailService.sendDashboardWelcome({ email: 'user@example.com' });

// Send receipt
await emailService.sendReceipt({
  email: 'user@example.com',
  amount: 29.99,
  planName: 'Pro',
  invoiceUrl: 'https://stripe.com/invoice/123',
});
```

## External Usage (Plugins/Website)

For external clients (WordPress plugins, website), use the public API endpoints:

```javascript
// Waitlist signup
await fetch('https://api.optti.dev/email/waitlist', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    plugin: 'AltText AI',
    source: 'website',
  }),
});
```

## Adding a New Email Type

To add a new email type:

1. **Add template function** in `src/emails/templates/index.js`:
   ```javascript
   function myNewEmail({ email, customField }) {
     const config = getEmailConfig();
     // ... build HTML and text
     return { subject, html, text };
   }
   ```

2. **Export from templates**:
   ```javascript
   module.exports = {
     // ... existing exports
     myNewEmail,
   };
   ```

3. **Add service method** in `src/services/emailService.js`:
   ```javascript
   async function sendMyNewEmail({ email, customField }) {
     const eventType = 'my_new_email';
     try {
       const template = myNewEmail({ email, customField });
       const result = await sendEmail({ ... });
       await logEvent({ email, eventType, ... });
       return { success: true, emailId: result.id };
     } catch (error) {
       // ... error handling
     }
   }
   ```

4. **Add route** (if needed) in `src/routes/email.js`:
   ```javascript
   router.post('/my-new-email', async (req, res) => {
     // ... validation
     const result = await emailService.sendMyNewEmail({ ... });
     // ... response
   });
   ```

5. **Add tests**:
   - Unit test for template in `tests/unit/emailTemplates.test.js`
   - Unit test for service method in `tests/unit/emailService.test.js`
   - Integration test for route in `tests/integration/emailRoutes.test.js`

## Database Migration

The `email_events` table must be created before using the email system:

```sql
-- Run: db/migrations/20250125_email_events.sql
```

This creates the table and indexes for efficient querying and de-duplication.

## Environment Variables

Required environment variables (see `config/env.example`):

```
RESEND_API_KEY=re_xxx
EMAIL_FROM=OpttiAI <hello@optti.dev>
TRANSACTIONAL_FROM_EMAIL=OpttiAI <hello@optti.dev>
BILLING_FROM_EMAIL=OpttiAI <billing@optti.dev>
BRAND_NAME=OpttiAI
BRAND_DOMAIN=optti.dev
SUPPORT_EMAIL=support@optti.dev
FRONTEND_DASHBOARD_URL=https://app.optti.dev
PUBLIC_API_DOMAIN=api.optti.dev
RESEND_AUDIENCE_ID=aud_xxx  # Optional
```

## Known Limitations

- React Email templates (`.tsx` files) exist but are not currently used by the new system
- Legacy `auth/email.js` still exists but is deprecated (password reset and welcome email now use `emailService`)
- Legacy `services/emailService.js` and `routes/email.js` exist but are separate from the new system
- Receipt emails are not automatically sent from Stripe webhooks (can be added to `handleInvoicePaid`)

## Future Enhancements

- Migrate React Email templates to be used by the new system
- Add automatic receipt emails from Stripe webhooks
- Add usage summary email automation
- Add user-managed email preferences
- Add unsubscribe functionality

