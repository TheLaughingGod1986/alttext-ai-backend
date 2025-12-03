# Subscriptions System

## Overview

The subscriptions system manages Stripe-based subscriptions for users, handling subscription creation, updates, cancellations, and webhook processing. Subscriptions are stored in the `subscriptions` table and synced with Stripe via webhooks.

## Stripe Subscription Flows

### 1. Subscription Creation

#### Flow

1. **User initiates subscription** via frontend
2. **Backend creates Stripe checkout session** via `billingService.createSubscription()`
3. **User completes payment** on Stripe checkout page
4. **Stripe sends webhook** `checkout.session.completed`
5. **Backend processes webhook** and creates subscription record
6. **Subscription synced** via `syncSubscriptionFromWebhook()`

#### Code Path

```javascript
// 1. Create checkout session
const result = await billingService.createSubscription({
  email: 'user@example.com',
  plugin: 'alttext-ai',
  priceId: 'price_xxx',
  plan: 'pro'
});

// 2. Webhook handler processes checkout.session.completed
// 3. Subscription synced to database
```

### 2. Subscription Updates

#### Webhook Events

- **`customer.subscription.updated`** - Subscription modified (plan change, quantity change, etc.)
- **`customer.subscription.created`** - New subscription created
- **`invoice.paid`** - Subscription payment successful

#### Update Process

1. **Stripe sends webhook** with updated subscription data
2. **Backend receives webhook** in `webhooks.js`
3. **Subscription synced** via `billingService.syncSubscriptionFromWebhook()`
4. **Database updated** with new subscription state
5. **Cache cleared** for the user

### 3. Subscription Cancellation

#### Flow

1. **User cancels subscription** (via Stripe customer portal or API)
2. **Stripe sends webhook** `customer.subscription.deleted` or `customer.subscription.updated` (with cancel_at_period_end)
3. **Backend processes cancellation**
4. **Subscription status updated** to 'canceled'
5. **Cache cleared**

#### Manual Cancellation

```javascript
const result = await billingService.cancelSubscription(subscriptionId);
```

## Webhook Lifecycle

### Webhook Endpoint

**Location:** `src/stripe/webhooks.js`

**Route:** `POST /stripe/webhook`

### Webhook Events Handled

#### customer.created
- Triggered when Stripe customer is created
- Mainly for logging/auditing

#### checkout.session.completed
- Triggered when checkout session completes
- Handles both subscription and credit pack purchases
- Creates subscription record if subscription type
- Adds credits if credit pack type

#### customer.subscription.created
- Triggered when subscription is created
- Syncs subscription to database
- Sends welcome email

#### customer.subscription.updated
- Triggered when subscription is updated
- Syncs subscription state
- Handles plan changes, quantity changes, cancellations

#### customer.subscription.deleted
- Triggered when subscription is canceled/deleted
- Updates subscription status to 'canceled'
- Clears cache

#### invoice.paid
- Triggered when subscription invoice is paid
- Logs payment for analytics
- Updates subscription metadata

#### invoice.payment_failed
- Triggered when payment fails
- Logs failure for analytics
- May trigger email notification

#### payment_intent.succeeded
- Triggered when payment intent succeeds
- Used for credit pack purchases
- Adds credits to user account

### Webhook Security

All webhooks are verified using Stripe signature:

```javascript
function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  return event;
}
```

### Webhook Processing Flow

1. **Verify signature** - Ensures webhook is from Stripe
2. **Route to handler** - Based on event type
3. **Process event** - Update database, send emails, etc.
4. **Return 200** - Acknowledge receipt to Stripe

## Subscription Status Logic

### Status Values

Subscriptions can have the following statuses:

- **`active`** - Subscription is active and paid
- **`trialing`** - Subscription is in trial period (treated as active)
- **`past_due`** - Payment failed, subscription past due
- **`canceled`** / **`cancelled`** - Subscription has been canceled
- **`inactive`** - Subscription is not active (default for free plan)

### Status Normalization

**Location:** `billingService.getUserSubscriptionStatus()`

Statuses are normalized:
- `trialing` → `active` (treated as active)
- `past_due` / `unpaid` → `past_due`
- `canceled` / `cancelled` → `cancelled`
- Other → `inactive`

### Subscription Status Object

```javascript
{
  plan: 'pro' | 'agency' | 'free',
  status: 'active' | 'inactive' | 'past_due' | 'cancelled',
  renewsAt: '2024-02-01T00:00:00Z' | null,
  canceledAt: '2024-01-15T00:00:00Z' | null,
  trialEndsAt: '2024-01-20T00:00:00Z' | null,
  raw: { /* full subscription object */ }
}
```

## Database Schema

### subscriptions Table

- `id` - UUID primary key
- `user_email` - User email (indexed, lowercase)
- `plugin_slug` - Plugin identifier
- `stripe_customer_id` - Stripe customer ID
- `stripe_subscription_id` - Stripe subscription ID (unique)
- `stripe_price_id` - Stripe price ID
- `plan` - Plan tier ('free', 'pro', 'agency')
- `status` - Subscription status
- `quantity` - Subscription quantity
- `renews_at` - Next renewal date (ISO string)
- `canceled_at` - Cancellation date (ISO string)
- `trial_ends_at` - Trial end date (ISO string)
- `metadata` - JSON metadata (includes full Stripe subscription object)
- `created_at` - Creation timestamp
- `updated_at` - Update timestamp

### Unique Constraint

Subscriptions are unique by `(user_email, plugin_slug)` combination.

## Billing Service Methods

### createSubscription

Creates a new subscription via Stripe checkout:

```javascript
async function createSubscription({ email, plugin, priceId, plan })
```

### cancelSubscription

Cancels a subscription:

```javascript
async function cancelSubscription(subscriptionId)
```

### syncSubscriptionFromWebhook

Syncs subscription state from Stripe webhook:

```javascript
async function syncSubscriptionFromWebhook(stripeEvent)
```

### getUserSubscriptionStatus

Gets standardized subscription status:

```javascript
async function getUserSubscriptionStatus(email)
```

Returns normalized status object with plan, status, and dates.

### getSubscriptionForEmail

Gets active subscription for email:

```javascript
async function getSubscriptionForEmail(email)
```

Returns first active subscription, or null if none.

## Caching

Subscriptions are cached for 30 seconds to reduce database load:

- **Cache key**: User email (lowercase)
- **Cache TTL**: 30 seconds
- **Cache invalidation**: Cleared on subscription updates/cancellations

## Integration with Access Control

Subscriptions are checked in `accessControlService.evaluateAccess()`:

1. **No subscription or free plan** → Check credits
2. **Inactive subscription** → Check credits
3. **Active paid subscription** → Allow access
4. **Credits override** → Credits always allow access

## API Endpoints

### POST /billing/create-checkout

Creates Stripe checkout session for subscription.

**Request:**
```json
{
  "email": "user@example.com",
  "priceId": "price_xxx",
  "service": "alttext-ai"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "cs_xxx",
  "url": "https://checkout.stripe.com/..."
}
```

### POST /billing/customer-portal

Creates Stripe customer portal session for subscription management.

**Request:**
```json
{
  "returnUrl": "https://app.example.com/dashboard"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://billing.stripe.com/..."
}
```

### POST /stripe/webhook

Stripe webhook endpoint (handles all subscription events).

## Best Practices

1. **Always verify webhook signatures** - Security requirement
2. **Handle idempotency** - Webhooks may be sent multiple times
3. **Sync subscription state** - Keep database in sync with Stripe
4. **Clear cache on updates** - Ensure fresh data
5. **Handle errors gracefully** - Webhook processing should never crash
6. **Log all events** - For audit trail and debugging
7. **Use metadata** - Store full Stripe subscription object in metadata

## Error Handling

All billing service methods return:
```javascript
{
  success: boolean,
  data?: Object,
  error?: string
}
```

Never throws errors - always returns result object.

## Related Services

- `billingService` - Subscription management
- `creditsService` - Credit balance (used for access control)
- `emailService` - Sends subscription-related emails
- `analyticsService` - Logs subscription events

