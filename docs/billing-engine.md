# Billing Engine Documentation

## Overview

The Optti billing engine provides a unified subscription system that works across all Optti plugins and the website. It integrates with Stripe for payment processing, manages subscriptions, tracks invoices, and enforces usage quotas.

## Architecture

### Core Components

1. **Database Layer** (`db/migrations/`)
   - `subscriptions` table: Tracks user subscriptions per plugin
   - `invoices` table: Stores payment invoices and receipts

2. **Service Layer** (`src/services/`)
   - `billingService.js`: Core billing logic (customer creation, subscriptions, syncing)
   - `userAccountService.js`: Aggregates account data including billing

3. **Client Abstraction** (`src/utils/`)
   - `stripeClient.js`: Single gateway for all Stripe API calls

4. **Configuration** (`src/config/`)
   - `plans.js`: Defines token quotas and Stripe price IDs for each plugin/plan tier

5. **Routes** (`src/routes/`)
   - `billing.js`: Public billing endpoints
   - `account.js`: Account overview including billing data

6. **Webhooks** (`src/stripe/`)
   - `webhooks.js`: Handles Stripe webhook events

## Subscription Lifecycle

### 1. Customer Creation

When a user initiates checkout:
- `billingService.createOrGetCustomer()` checks for existing Stripe customer
- If not found, creates new customer in Stripe
- Customer ID is stored in subscription records

### 2. Subscription Creation

When user completes checkout:
- Stripe creates subscription via checkout session
- Webhook `customer.subscription.created` triggers
- `billingService.syncSubscriptionFromWebhook()` stores subscription in database
- Subscription email sent via `emailService.sendLicenseActivated()`

### 3. Subscription Updates

When subscription changes:
- Webhook `customer.subscription.updated` triggers
- `billingService.syncSubscriptionFromWebhook()` updates database
- Status, renewal date, and plan changes are synced

### 4. Subscription Cancellation

When user cancels:
- Webhook `customer.subscription.deleted` triggers
- Subscription status set to 'canceled' in database
- Cancellation email sent (if implemented)

## Webhook Flows

### Supported Events

- `customer.created`: Logged for auditing
- `customer.subscription.created`: Sync subscription, send activation email
- `customer.subscription.updated`: Sync subscription changes
- `customer.subscription.deleted`: Mark as canceled, send cancellation email
- `invoice.paid`: Store invoice, send receipt email
- `invoice.payment_failed`: Send payment failed email

### Webhook Endpoint

**POST** `/stripe/webhook`

- Requires Stripe signature verification
- Uses raw body parser (before express.json())
- Returns `{ received: true }` on success

## Plan Configuration

Plans are defined in `src/config/plans.js`:

```javascript
{
  'alttext-ai': {
    free: { tokens: 50 },
    pro: { tokens: 1000, priceId: process.env.ALTTEXT_AI_STRIPE_PRICE_PRO },
    agency: { tokens: 10000, priceId: process.env.ALTTEXT_AI_STRIPE_PRICE_AGENCY },
  }
}
```

### Plan Tiers

- **Free**: Limited token quota (no payment)
- **Pro**: Higher quota, monthly subscription
- **Agency**: Highest quota, monthly subscription

## API Endpoints

### POST /billing/create-checkout

Creates a Stripe Checkout Session.

**Request:**
```json
{
  "email": "user@example.com",
  "plugin": "alttext-ai",
  "priceId": "price_123"
}
```

**Response:**
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/..."
}
```

### POST /billing/create-portal

Creates a Stripe Customer Portal session for managing subscriptions.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "url": "https://billing.stripe.com/..."
}
```

### POST /billing/subscriptions

Gets all subscriptions for a user.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "subscriptions": [
    {
      "id": "uuid",
      "user_email": "user@example.com",
      "plugin_slug": "alttext-ai",
      "plan": "pro",
      "status": "active",
      "renews_at": "2025-03-01T00:00:00Z"
    }
  ]
}
```

## Quota Enforcement

Quota enforcement is integrated into the `/api/generate` endpoint:

1. **Find Subscription**: Look up active subscription for user + plugin
2. **Get Plan**: Determine plan tier (free/pro/agency)
3. **Get Allowed Quota**: From `plans.js` config
4. **Get Used Quota**: Count from `usage_logs` table
5. **Check**: If `used >= allowed`, return `{ ok: false, error: "quota_exceeded" }`

This enables upsell modals in plugins when quota is exceeded.

## How Plugins Integrate

1. **Checkout Flow**:
   - Plugin calls `POST /billing/create-checkout` with user email, plugin slug, and price ID
   - User redirected to Stripe Checkout
   - On success, webhook creates subscription

2. **Quota Checking**:
   - Plugin calls `/api/generate` for each generation
   - Backend checks subscription quota
   - If exceeded, returns `quota_exceeded` error
   - Plugin shows upgrade modal

3. **Account Management**:
   - Plugin can call `POST /billing/create-portal` to let users manage subscriptions
   - Users can upgrade, downgrade, or cancel

## How Website Dashboard Connects

The website dashboard uses:

1. **Account Overview**: `POST /account/overview`
   - Returns installations, plugins, sites, subscriptions, usage, invoices
   - Single source of truth for user account

2. **Subscription Management**:
   - Display active subscriptions
   - Show usage vs. quota
   - Link to Stripe Customer Portal

3. **Invoice History**:
   - Display past invoices
   - Link to hosted invoice URLs

## Database Schema

### subscriptions

- `id` (uuid): Primary key
- `user_email` (text): User email (lowercased)
- `plugin_slug` (text): Plugin identifier
- `stripe_customer_id` (text): Stripe customer ID
- `stripe_subscription_id` (text): Stripe subscription ID
- `stripe_price_id` (text): Stripe price ID
- `plan` (text): Plan tier (free/pro/agency)
- `status` (text): Subscription status (active/canceled)
- `quantity` (int): Subscription quantity
- `renews_at` (timestamptz): Next renewal date
- `canceled_at` (timestamptz): Cancellation date
- `metadata` (jsonb): Additional data
- Unique constraint on `(user_email, plugin_slug)`

### invoices

- `id` (uuid): Primary key
- `invoice_id` (text): Stripe invoice ID (unique)
- `user_email` (text): User email
- `plugin_slug` (text): Plugin identifier
- `amount` (integer): Amount in cents
- `currency` (text): Currency code (usd, gbp, etc.)
- `hosted_invoice_url` (text): Stripe hosted invoice URL
- `pdf_url` (text): Invoice PDF URL
- `paid_at` (timestamptz): Payment timestamp
- `receipt_email_sent` (boolean): Whether receipt email was sent

## Error Handling

All billing service methods return:
```javascript
{ success: true, data: {...} }  // Success
{ success: false, error: "..." } // Failure
```

Never throws exceptions - always returns error objects.

## Testing

- **Unit Tests**: `tests/unit/billingService.test.js`, `tests/unit/stripeClient.test.js`, `tests/unit/plans.test.js`
- **Integration Tests**: `tests/integration/billingRoutes.test.js`

Coverage target: ≥85% for billing subsystem.

## Environment Variables

Required:
- `STRIPE_SECRET_KEY`: Stripe secret API key
- `STRIPE_WEBHOOK_SECRET`: Webhook signature secret
- `ALTTEXT_AI_STRIPE_PRICE_PRO`: Pro plan price ID
- `ALTTEXT_AI_STRIPE_PRICE_AGENCY`: Agency plan price ID
- `SEO_AI_META_STRIPE_PRICE_PRO`: SEO plugin Pro price ID
- `SEO_AI_META_STRIPE_PRICE_AGENCY`: SEO plugin Agency price ID
- `BEEPBEEP_AI_STRIPE_PRICE_PRO`: BeepBeep plugin Pro price ID
- `BEEPBEEP_AI_STRIPE_PRICE_AGENCY`: BeepBeep plugin Agency price ID

## Future Enhancements

- [ ] Subscription upgrade/downgrade flows
- [ ] Prorated billing calculations
- [ ] Usage-based billing (pay-per-use)
- [ ] Multi-currency support
- [ ] Tax calculation integration
- [ ] Subscription analytics dashboard

