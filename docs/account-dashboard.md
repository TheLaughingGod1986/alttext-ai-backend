# Account Dashboard API Documentation

## Overview

The Account Dashboard API provides a unified endpoint that aggregates all user account data into a single response. This enables the website dashboard to render everything without multiple scattered API calls.

## Endpoint

**POST** `/account/summary`

### Request

```json
{
  "email": "user@example.com"
}
```

### Response

```json
{
  "ok": true,
  "data": {
    "email": "user@example.com",
    "installations": [
      {
        "id": "uuid",
        "plugin_slug": "alttext-ai",
        "site_url": "https://example.com",
        "version": "1.0.0",
        "wp_version": "6.0",
        "last_seen_at": "2025-01-15T10:00:00Z",
        "created_at": "2025-01-01T00:00:00Z"
      }
    ],
    "subscriptions": [
      {
        "id": "uuid",
        "user_email": "user@example.com",
        "plugin_slug": "alttext-ai",
        "plan": "pro",
        "status": "active",
        "renews_at": "2025-02-01T00:00:00Z",
        "stripe_subscription_id": "sub_123"
      }
    ],
    "usage": {
      "alttext-ai": {
        "monthlyImages": 450,
        "dailyImages": 15,
        "totalImages": 2000,
        "quota": 1000,
        "remaining": 550
      },
      "beepbeep-ai": {
        "monthlyImages": 1421,
        "dailyImages": 22,
        "totalImages": 5000,
        "quota": 1500,
        "remaining": 79
      }
    },
    "plans": {
      "alttext-ai": {
        "currentPlan": "pro",
        "monthlyImages": 1000,
        "tokens": 1000
      },
      "beepbeep-ai": {
        "currentPlan": "free",
        "monthlyImages": 25,
        "tokens": 25
      }
    }
  }
}
```

## Data Sources

### Installations

Source: `plugin_installations` table via `userAccountService.getUserInstallations()`

Returns all plugin installations for the user, including:
- Plugin slug
- Site URL
- Version information
- Last seen timestamp
- Installation metadata

### Subscriptions

Source: `subscriptions` table via `billingService.getUserSubscriptions()`

Returns all active and inactive subscriptions, including:
- Plugin slug
- Plan tier (free/pro/agency)
- Subscription status
- Renewal date
- Stripe subscription ID

### Usage

Source: `usage_logs` table aggregated via `usageService.getUsageSummary()`

Returns per-plugin usage statistics:
- `monthlyImages`: Usage count for current month
- `dailyImages`: Usage count for today
- `totalImages`: Total usage count (all time)
- `quota`: Plan-based quota limit (from plans config)
- `remaining`: Calculated remaining quota (quota - monthlyImages)

**Note:** Currently, usage is aggregated across all plugins since `usage_logs` doesn't store service/plugin information. The usage is distributed evenly across all user's plugins. Future enhancement: Add service/plugin tracking to `usage_logs` table.

### Plans

Source: `src/config/plans.js` merged with subscription data

Returns per-plugin plan information:
- `currentPlan`: Determined from subscription (or defaults to 'free')
- `monthlyImages`: Quota limit from plans config
- `tokens`: Token quota from plans config (same as monthlyImages)

## How Usage is Calculated

1. **Monthly Usage**: Count of `usage_logs` entries created in the current month
2. **Daily Usage**: Count of `usage_logs` entries created today
3. **Total Usage**: Count of all `usage_logs` entries for the user
4. **Quota**: Looked up from `plans.js` based on plugin + current plan
5. **Remaining**: Calculated as `quota - monthlyImages` (minimum 0)

## How Plan Limits are Determined

1. Get all subscriptions for the user
2. For each plugin (from installations or subscriptions):
   - Find matching subscription
   - Extract `plan` field (free/pro/agency)
   - Default to 'free' if no subscription
3. Look up quota in `src/config/plans.js`:
   ```javascript
   plansConfig[pluginSlug][plan].tokens
   ```
4. Return plan limits merged with usage data

## How Remaining Quota is Computed

```
remaining = max(0, quota - monthlyImages)
```

Where:
- `quota`: From plans config based on plugin + current plan
- `monthlyImages`: Count of usage_logs in current month

## Error Handling

### Validation Errors (400)

```json
{
  "ok": false,
  "error": "Invalid email"
}
```

### Service Errors (500)

```json
{
  "ok": false,
  "error": "Failed to fetch account summary"
}
```

Errors are handled gracefully - if one data source fails, others are still returned with empty arrays/objects.

## Rate Limiting

- **Limit**: 30 requests per IP per 15 minutes
- **Headers**: Standard rate limit headers included
- **Response**: 429 Too Many Requests when exceeded

## Example Requests

### cURL

```bash
curl -X POST https://api.optti.dev/account/summary \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

### JavaScript

```javascript
const response = await fetch('https://api.optti.dev/account/summary', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com' }),
});

const data = await response.json();
```

## Response Time

Target response time: < 500ms for typical user data

The endpoint uses `Promise.all` to fetch all data sources in parallel for optimal performance.

## Plugin Integration

Plugins can link users to the dashboard:

```
https://yourwebsite.com/account?email=user@example.com
```

The dashboard will use this endpoint to fetch all account data and display:
- Plugin installations table
- Subscriptions overview
- Usage overview per plugin
- Plan limits and remaining quotas

## Future Enhancements

- [ ] Add service/plugin tracking to `usage_logs` table for accurate per-plugin usage
- [ ] Add usage history/trends
- [ ] Add billing/invoice data to summary
- [ ] Add organization/team data
- [ ] Add caching layer for frequently accessed data
- [ ] Add real-time usage updates via WebSocket

## Related Documentation

- [Billing Engine Documentation](./billing-engine.md)
- [Account Endpoints Documentation](./account-endpoints.md)
- [Plan Configuration](../src/config/plans.js)

