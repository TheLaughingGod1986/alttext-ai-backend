# Email System Current State Documentation

This document maps all current email-related code and flows in the backend before centralization.

## Email-Related Files

### Core Email Infrastructure
- **`src/utils/resendClient.js`** - Resend client wrapper (new, centralized)
- **`src/services/emailService.js`** - New email service with methods for waitlist, dashboard welcome, license activated, low credit warning, receipt, plugin signup, and subscribe
- **`src/config/emailConfig.js`** - Email configuration helper (needs to move to `src/emails/emailConfig.js` per plan)
- **`src/emails/templates/index.js`** - HTML email template functions
- **`src/emails/`** - React Email templates (.tsx files) and renderHelper.js
- **`src/routes/email.js`** - New email API routes (waitlist, dashboard-welcome, plugin-signup, license-activated, low-credit-warning, receipt)
- **`src/routes/waitlist.js`** - Waitlist signup endpoint (calls emailService.sendWaitlistWelcome and subscribe)

### Legacy Email Code
- **`auth/email.js`** - Legacy email service with direct Resend calls:
  - `sendPasswordResetEmail()` - Direct Resend call with inline HTML
  - `sendWelcomeEmail()` - Direct Resend call with inline HTML
  - Both have hardcoded "AltText AI" branding
  - Both have fallback to SendGrid and console logging
- **`routes/email.js`** - Legacy email routes (different from `src/routes/email.js`)
- **`services/emailService.js`** - Legacy email service (different from `src/services/emailService.js`)

## Current Email Flows

### 1. Password Reset Email
**Location:** `auth/email.js` → `sendPasswordResetEmail()`
**Triggered from:** `auth/routes.js` → `POST /auth/forgot-password`
**Current Implementation:**
- Direct Resend API call (bypasses `resendClient`)
- Inline HTML template with hardcoded "AltText AI" branding
- Uses `RESEND_FROM_EMAIL` env var or hardcoded fallback
- Has SendGrid fallback and console logging fallback
- **Needs Migration:** Should use `emailService.sendPasswordReset()` with template from `src/emails/templates/`

### 2. Welcome Email (User Registration)
**Location:** `auth/email.js` → `sendWelcomeEmail()`
**Triggered from:** `auth/routes.js` → `POST /auth/register`
**Current Implementation:**
- Direct Resend API call (bypasses `resendClient`)
- Inline HTML template with hardcoded "SEO AI Alt Text Generator" branding
- Uses `RESEND_FROM_EMAIL` env var or hardcoded fallback
- Has SendGrid fallback and console logging fallback
- **Needs Migration:** Should use `emailService.sendDashboardWelcome()` or new welcome email method

### 3. Waitlist Welcome Email
**Location:** `src/services/emailService.js` → `sendWaitlistWelcome()`
**Triggered from:** `src/routes/waitlist.js` → `POST /waitlist/submit`
**Current Implementation:**
- Uses `resendClient.sendEmail()` (correct)
- Uses template from `src/emails/templates/index.js` → `welcomeWaitlistEmail()`
- Also calls `emailService.subscribe()` to add to Resend audience
- **Status:** Already centralized ✓

### 4. Dashboard Welcome Email
**Location:** `src/services/emailService.js` → `sendDashboardWelcome()`
**Triggered from:** `src/routes/email.js` → `POST /email/dashboard-welcome`
**Current Implementation:**
- Uses `resendClient.sendEmail()` (correct)
- Uses template from `src/emails/templates/index.js` → `welcomeDashboardEmail()`
- **Status:** Already centralized ✓

### 5. License Activated Email
**Location:** `src/services/emailService.js` → `sendLicenseActivated()`
**Triggered from:** `src/routes/email.js` → `POST /email/license-activated`
**Current Implementation:**
- Uses `resendClient.sendEmail()` (correct)
- Uses template from `src/emails/templates/index.js` → `licenseActivatedEmail()`
- **Status:** Already centralized ✓
- **Note:** Legacy `routes/email.js` has `/license/activated` route that calls `emailService.sendLicenseIssuedEmail()` - need to check if this is different

### 6. Low Credit Warning Email
**Location:** `src/services/emailService.js` → `sendLowCreditWarning()`
**Triggered from:** `src/routes/email.js` → `POST /email/low-credit-warning`
**Current Implementation:**
- Uses `resendClient.sendEmail()` (correct)
- Uses template from `src/emails/templates/index.js` → `lowCreditWarningEmail()`
- **Status:** Already centralized ✓
- **Note:** Need to check if usage routes actually call this when credits are low

### 7. Receipt Email
**Location:** `src/services/emailService.js` → `sendReceipt()`
**Triggered from:** `src/routes/email.js` → `POST /email/receipt`
**Current Implementation:**
- Uses `resendClient.sendEmail()` (correct)
- Uses template from `src/emails/templates/index.js` → `receiptEmail()`
- **Status:** Already centralized ✓
- **Note:** Need to check if Stripe webhook handlers call this

### 8. Plugin Signup Email
**Location:** `src/services/emailService.js` → `sendPluginSignup()`
**Triggered from:** `src/routes/email.js` → `POST /email/plugin-signup`
**Current Implementation:**
- Uses `resendClient.sendEmail()` (correct)
- Uses template from `src/emails/templates/index.js` → `pluginSignupEmail()`
- **Status:** Already centralized ✓

## Direct Resend Calls (Need Migration)

1. **`auth/email.js`**:
   - `sendPasswordResetEmail()` - Line 23: `const resend = new Resend(process.env.RESEND_API_KEY)`
   - `sendWelcomeEmail()` - Line 176: `const resend = new Resend(process.env.RESEND_API_KEY)`
   - Both need to be migrated to use `resendClient` and `emailService`

## Hardcoded Values Found

1. **`auth/email.js`**:
   - "AltText AI" (multiple places)
   - "SEO AI Alt Text Generator" (welcome email)
   - `'AltText AI <noreply@alttextai.com>'` (from email fallback)
   - `'noreply@alttextai.com'` (SendGrid fallback)

2. **`src/config/emailConfig.js`**:
   - Default fallbacks: `'AltText AI'`, `'optti.dev'`, `'support@optti.dev'`, etc.
   - These are acceptable as fallbacks but should use env vars when available

## Email Tests

### Unit Tests
- `tests/unit/emailConfig.test.js` - Tests email configuration
- `tests/unit/resendClient.test.js` - Tests Resend client wrapper
- `tests/unit/emailTemplates.test.js` - Tests email templates
- `tests/unit/emailService.test.js` - Tests email service methods

### Integration Tests
- `tests/integration/emailRoutes.test.js` - Tests email API routes
- `tests/integration/email.test.js` - Legacy email route tests
- `tests/integration/waitlistRoutes.test.js` - Tests waitlist endpoint

## Migration Priorities

1. **High Priority:**
   - Migrate `auth/email.js` password reset to use `emailService.sendPasswordReset()`
   - Migrate `auth/email.js` welcome email to use `emailService.sendDashboardWelcome()`
   - Move `src/config/emailConfig.js` to `src/emails/emailConfig.js`
   - Add `transactionalFromEmail` and `billingFromEmail` to config

2. **Medium Priority:**
   - Verify billing routes call `emailService.sendReceipt()` after Stripe payments
   - Verify usage routes call `emailService.sendLowCreditWarning()` when credits low
   - Verify license routes call `emailService.sendLicenseActivated()` when license created
   - Add email event logging and de-duplication

3. **Low Priority:**
   - Add `usageSummaryEmail` template (future feature)
   - Consolidate legacy `routes/email.js` and `services/emailService.js` if still in use

## Notes

- There are two `emailService.js` files: one in `services/` (legacy) and one in `src/services/` (new)
- There are two `routes/email.js` files: one in `routes/` (legacy) and one in `src/routes/` (new)
- The new system is already partially implemented and working for waitlist, dashboard welcome, license activated, low credit warning, receipt, and plugin signup
- The main migration work is moving password reset and welcome email from `auth/email.js` to the centralized system

