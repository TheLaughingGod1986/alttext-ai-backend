# Access Control System

## Overview

The backend uses a unified access control system that combines subscription status, credit balance, and plan limits to determine whether a user can perform AI generation actions.

## NO_ACCESS Error Codes

All access denials return a standardized error format:

```json
{
  "ok": false,
  "code": "NO_ACCESS",
  "reason": "<specific_reason>",
  "message": "<human_readable_message>"
}
```

### Error Code Constants

Defined in `src/constants/errorCodes.js`:

- **NO_ACCESS**: Main error code for all access denials
- **REASONS**: Specific denial reasons:
  - `no_subscription`: User has no subscription and no credits
  - `subscription_inactive`: User's subscription exists but is inactive
  - `no_credits`: User has no credits remaining
  - `plan_limit`: User has reached their plan limit
  - `no_identity`: User identity could not be determined

## requireSubscription Middleware

**Location:** `src/middleware/requireSubscription.js`

### Purpose

Enforces subscription-based access control for AI generation endpoints. Must be used after `authenticateToken` middleware.

### Usage

```javascript
const requireSubscription = require('./src/middleware/requireSubscription');

router.post('/api/generate', authenticateToken, requireSubscription, handler);
```

### Behavior

1. Extracts email from authenticated request (`req.user.email`)
2. Calls `accessControlService.evaluateAccess()` to check access
3. If allowed: proceeds to next middleware/handler
4. If denied: returns 403 with standardized NO_ACCESS error

### Error Responses

- **401 Unauthorized**: No email in token
  ```json
  {
    "ok": false,
    "code": "NO_ACCESS",
    "reason": "no_identity",
    "message": "Authentication required."
  }
  ```

- **403 Forbidden**: Access denied
  ```json
  {
    "ok": false,
    "code": "NO_ACCESS",
    "reason": "no_subscription",
    "message": "No active subscription found. Please subscribe to continue."
  }
  ```

## accessControlService Logic

**Location:** `src/services/accessControlService.js`

### evaluateAccess Function

Evaluates access for a user to perform an AI action by combining:
- Subscription status (from `billingService`)
- Credit balance (from `creditsService`)
- Plan limits

### Decision Logic Flow

1. **No Subscription or Free Plan**
   - If user has credits > 0: **ALLOW** (credits override)
   - If user has no credits: **DENY** (`no_subscription`)

2. **Inactive Subscription**
   - If user has credits > 0: **ALLOW** (credits override)
   - If user has no credits: **DENY** (`subscription_inactive`)

3. **Credits Override**
   - If user has credits > 0: **ALLOW** (regardless of subscription status)

4. **Free Plan**
   - If user has credits > 0: **ALLOW**
   - If user has no credits: **DENY** (`no_credits`)

5. **Active Paid Subscription**
   - **ALLOW** (even without credits - plan limits enforced elsewhere)

6. **Default (Fail-safe)**
   - **DENY** (`no_credits`)

### Key Principles

- **Credits Override**: Credits always allow access, even if subscription is inactive
- **Fail-Safe**: On any error, access is denied (prioritize blocking over allowing)
- **Never Throws**: Service always returns allow/deny decision, never throws errors

## How Plugin/Website Should Interpret Denial Reasons

### Client-Side Handling

When receiving a `NO_ACCESS` error, clients should:

1. **Check the `reason` field** (not just the `code`)
2. **Display appropriate user message** from the `message` field
3. **Take appropriate action** based on reason:

#### `no_subscription`
- **Action**: Show upgrade/subscribe prompt
- **Message**: "You need a subscription or credits to use this feature"
- **UI**: Display subscription plans or credit purchase options

#### `subscription_inactive`
- **Action**: Show renewal prompt
- **Message**: "Your subscription has expired. Please renew to continue"
- **UI**: Display renewal button or billing portal link

#### `no_credits`
- **Action**: Show credit purchase prompt
- **Message**: "You have no credits remaining. Purchase credits to continue"
- **UI**: Display credit pack purchase options

#### `plan_limit`
- **Action**: Show upgrade prompt
- **Message**: "You've reached your plan limit. Upgrade to continue"
- **UI**: Display upgrade options

#### `no_identity`
- **Action**: Re-authenticate user
- **Message**: "Authentication required. Please log in again"
- **UI**: Redirect to login

### Example Client Code

```javascript
async function generateAltText(imageUrl) {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageUrl })
    });

    const data = await response.json();

    if (!data.ok && data.code === 'NO_ACCESS') {
      switch (data.reason) {
        case 'no_subscription':
          showSubscribeModal();
          break;
        case 'subscription_inactive':
          showRenewalPrompt();
          break;
        case 'no_credits':
          showCreditPurchaseModal();
          break;
        case 'plan_limit':
          showUpgradePrompt();
          break;
        case 'no_identity':
          redirectToLogin();
          break;
      }
      return { error: data.message };
    }

    return data;
  } catch (error) {
    console.error('Generation error:', error);
    return { error: 'Failed to generate alt text' };
  }
}
```

## Integration Points

### Routes Using requireSubscription

- `/api/generate` - AI image generation
- `/api/review` - AI content review

### Services Used

- `billingService.getUserSubscriptionStatus()` - Gets subscription status
- `creditsService.getOrCreateIdentity()` - Gets/creates user identity
- `creditsService.getBalanceByEmail()` - Gets credit balance

## Error Handler Integration

The `errorHandler` middleware maps `NO_ACCESS` to `access_denied` reason for consistent error responses across the API.

## Best Practices

1. **Always check `reason` field** - Don't just check for `NO_ACCESS` code
2. **Use `message` field for user display** - It contains human-readable text
3. **Handle all reason types** - Don't assume only one type of denial
4. **Credits override subscription** - Users with credits can always use the service
5. **Fail-safe design** - Errors result in denial, not allowance
