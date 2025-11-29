# Access Control System

## Overview

The access control system provides centralized, standardized access control for AI generation endpoints. It evaluates subscription status, credit balance, and plan limits to determine whether a user can perform AI actions.

## Error Format

All access control failures return a standardized JSON response:

```json
{
  "ok": false,
  "code": "NO_ACCESS",
  "reason": "subscription_inactive",
  "message": "Your subscription is inactive. Please renew to continue."
}
```

### Response Fields

- `ok` (boolean): Always `false` for access denials
- `code` (string): Always `"NO_ACCESS"` for access control failures
- `reason` (string): Specific reason code (see below)
- `message` (string): Human-readable error message

### HTTP Status Codes

- `401 Unauthorized`: Authentication required (no email in token)
- `403 Forbidden`: Access denied (subscription/credits check failed)
- `500 Internal Server Error`: Unexpected server error

## Access Denial Reasons

The `reason` field can be one of the following values:

### `no_subscription`
User has no active subscription and no credits remaining.

**Message**: "No active subscription found. Please subscribe to continue."

**When it occurs**:
- User has no subscription record
- User has a free plan with 0 credits
- User's subscription was never created

### `subscription_inactive`
User has a subscription but it is not in active status.

**Message**: "Your subscription is inactive. Please renew to continue."

**When it occurs**:
- Subscription status is `cancelled`, `past_due`, or `incomplete`
- Subscription has expired (renews_at is in the past)
- Subscription is in trial but trial has ended

### `no_credits`
User has no credits remaining and cannot use the service.

**Message**: "You have no credits remaining. Please purchase credits or subscribe."

**When it occurs**:
- User has 0 credits and no active subscription
- User's credits have been exhausted

### `plan_limit`
User has reached their plan's usage limit.

**Message**: "You have reached your plan limit. Please upgrade to continue."

**When it occurs**:
- User has exceeded monthly quota for their plan
- Note: This reason is reserved for future implementation

### `no_identity`
User authentication failed or email is missing from token.

**Message**: "Authentication required."

**When it occurs**:
- No JWT token provided
- Token is invalid or expired
- Token does not contain email field

## Access Control Logic

The access control system evaluates access in the following order:

1. **Identity Check**: Verify user identity exists (via `creditsService.getOrCreateIdentity`)
2. **Subscription Status**: Load subscription status (via `billingService.getUserSubscriptionStatus`)
3. **Credit Balance**: Load credit balance (via `creditsService.getBalanceByEmail`)
4. **Decision Logic**:
   - If no subscription → Check credits → Deny if no credits
   - If inactive subscription → Check credits → Deny if no credits
   - If credits > 0 → **Allow** (credits override subscription)
   - If active subscription → **Allow** (even with 0 credits)
   - Default → Deny

### Credits Override

**Important**: If a user has credits > 0, access is granted regardless of subscription status. This allows credit-based users to use the service even if their subscription is inactive or expired.

## Implementation Details

### Middleware: `requireSubscription`

The `requireSubscription` middleware must be used after `authenticateToken` middleware:

```javascript
app.post('/api/generate', authenticateToken, requireSubscription, handler);
```

**Flow**:
1. Extract email from `req.user.email`
2. If no email → Return 401 with `no_identity` reason
3. Call `accessControlService.evaluateAccess(email, req.path)`
4. If allowed → Call `next()`
5. If denied → Return 403 with standardized error format

### Service: `accessControlService`

The `accessControlService.evaluateAccess(email, action)` function:

- **Never throws errors** - always returns allow/deny decision
- **Fail-safe**: On any error, denies access (prioritizes blocking over allowing)
- Returns `{ allowed: true }` or `{ allowed: false, code, reason, message }`

### Service: `billingService.getUserSubscriptionStatus`

Returns standardized subscription status:

```javascript
{
  plan: "free" | "pro" | "agency",
  status: "active" | "cancelled" | "past_due" | "incomplete",
  renewsAt: ISO string | null,
  canceledAt: ISO string | null,
  trialEndsAt: ISO string | null,
  raw: {...} // Raw subscription data
}
```

## Plugin/Website Integration

### Handling NO_ACCESS Errors

When the plugin or website receives a `NO_ACCESS` error, it should:

1. **Check the `reason` field** to determine the specific issue
2. **Display appropriate UI** based on the reason:
   - `no_subscription` → Show subscription upgrade modal
   - `subscription_inactive` → Show subscription renewal prompt
   - `no_credits` → Show credit purchase options
   - `plan_limit` → Show plan upgrade options
3. **Redirect to billing** if needed:
   - Use the billing endpoints to create checkout sessions
   - Link to customer portal for subscription management

### Example Error Handling

```javascript
try {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Site-Hash': siteHash,
    },
    body: JSON.stringify({ image_data, service: 'alttext-ai' }),
  });

  const data = await response.json();

  if (!data.ok && data.code === 'NO_ACCESS') {
    switch (data.reason) {
      case 'no_subscription':
        showUpgradeModal();
        break;
      case 'subscription_inactive':
        showRenewalPrompt();
        break;
      case 'no_credits':
        showCreditPurchase();
        break;
      default:
        showGenericError(data.message);
    }
    return;
  }

  // Handle successful generation
} catch (error) {
  // Handle network errors
}
```

## Testing

### Unit Tests

- `tests/unit/accessControlService.test.js`: Tests access control logic
- `tests/unit/requireSubscription.test.js`: Tests middleware behavior

### Integration Tests

- `tests/integration/accessControl.test.js`: Tests end-to-end access control scenarios

## Migration Notes

The new `requireSubscription` middleware replaces the previous `checkSubscription` middleware. Key differences:

1. **Standardized errors**: All errors use the `NO_ACCESS` code format
2. **Credits override**: Credits now override subscription checks
3. **Fail-safe**: Errors always result in denial (safer default)

The old `checkSubscription` middleware can be deprecated but is kept for backward compatibility with legacy routes if needed.

