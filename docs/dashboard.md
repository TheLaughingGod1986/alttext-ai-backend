# Dashboard API

## Overview

The dashboard API provides aggregated data for user dashboards, including installations, subscriptions, usage statistics, credits, and recent activity. All endpoints require authentication via JWT token.

## GET /dashboard

Returns complete dashboard payload with installations, subscription, usage, credits, and recent events.

### Authentication

Requires JWT token in `Authorization` header:
```
Authorization: Bearer <token>
```

### Response Structure

```json
{
  "ok": true,
  "installations": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "plugin_slug": "alttext-ai",
      "site_url": "https://example.com",
      "version": "1.0.0",
      "wp_version": "6.4",
      "php_version": "8.2",
      "last_seen_at": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "subscription": {
    "id": "uuid",
    "user_email": "user@example.com",
    "plugin_slug": "alttext-ai",
    "stripe_subscription_id": "sub_xxx",
    "plan": "pro",
    "status": "active",
    "renews_at": "2024-02-01T00:00:00Z",
    "next_renewal": "2024-02-01T00:00:00Z",
    "last_payment": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "subscriptionStatus": "active",
  "quotaRemaining": 850,
  "quotaUsed": 150,
  "usage": {
    "monthlyImages": 150,
    "dailyImages": 5,
    "totalImages": 1000
  },
  "credits": {
    "balance": 250,
    "recentPurchases": [
      {
        "id": "uuid",
        "amount": 100,
        "created_at": "2024-01-15T00:00:00Z",
        "balance_after": 250,
        "transaction_type": "purchase"
      }
    ]
  },
  "recentEvents": [
    {
      "id": "uuid",
      "event_type": "alttext_generated",
      "created_at": "2024-01-20T00:00:00Z",
      "credits_delta": -1,
      "metadata": {
        "image_url": "https://example.com/image.jpg",
        "plugin": "alttext-ai"
      }
    }
  ]
}
```

### Data Model

#### installations

Array of plugin installations for the user. Each installation includes:
- Plugin information (slug, version, site URL)
- WordPress/PHP version info
- Last seen timestamp

#### subscription

Subscription object with:
- **plan**: 'free', 'pro', or 'agency'
- **status**: 'active', 'inactive', 'expired', 'cancelled'
- **next_renewal**: ISO timestamp of next renewal date
- **last_payment**: ISO timestamp of last payment (from Stripe `current_period_start`)

#### subscriptionStatus

Computed status:
- `'active'` - Subscription is active
- `'inactive'` - Subscription is not active
- `'expired'` - Subscription renewal date has passed
- `'none'` - No subscription found

#### quotaRemaining / quotaUsed

Quota information based on plan limits:
- Calculated from plan token limits
- `quotaUsed` = monthly image count
- `quotaRemaining` = plan limit - quotaUsed

#### usage

Usage summary:
- **monthlyImages**: Images generated this month
- **dailyImages**: Images generated today
- **totalImages**: Total images generated

#### credits

Credit information:
- **balance**: Current credit balance
- **recentPurchases**: Last 5 credit purchase transactions

#### recentEvents

Last 20 events from the events table:
- Event type, timestamp, metadata
- Credit deltas (positive for purchases, negative for usage)

### Caching

Response is cached for **45 seconds** to reduce database load. Cache is keyed by user email.

### Error Responses

```json
{
  "ok": false,
  "code": "DASHBOARD_ERROR",
  "reason": "server_error",
  "message": "Failed to load dashboard"
}
```

## GET /dashboard/charts

Returns aggregated chart data in a single call.

### Response Structure

```json
{
  "ok": true,
  "charts": {
    "dailyUsage": [
      { "date": "2024-01-01", "count": 10 },
      { "date": "2024-01-02", "count": 15 }
    ],
    "monthlyUsage": [
      { "month": "2024-01", "count": 300 },
      { "month": "2024-02", "count": 250 }
    ],
    "creditTrend": [
      { "date": "2024-01-01", "balance": 100 },
      { "date": "2024-01-02", "balance": 99 }
    ],
    "subscriptionHistory": [],
    "installActivity": [],
    "usageHeatmap": [],
    "eventSummary": []
  },
  "subscriptionStatus": "active",
  "quotaRemaining": 850,
  "quotaUsed": 150
}
```

### Chart Data Types

#### dailyUsage

Array of daily usage counts for last 30 days:
```json
{ "date": "YYYY-MM-DD", "count": number }
```

#### monthlyUsage

Array of monthly usage counts for last 12 months:
```json
{ "month": "YYYY-MM", "count": number }
```

#### creditTrend

Array of credit balance over time:
```json
{ "date": "YYYY-MM-DD", "balance": number }
```

#### subscriptionHistory

Array of subscription status changes over time.

#### installActivity

Array of plugin installation activity.

#### usageHeatmap

Array of usage heatmap data.

#### eventSummary

Summary of recent events.

### Always Present Arrays

All chart arrays are always present (can be empty `[]`) so frontend never has to null-check.

## GET /dashboard/usage/daily

Returns 30 days of daily usage for line charts (legacy format).

### Response

```json
{
  "ok": true,
  "days": [
    { "date": "2024-01-01", "count": 10 },
    { "date": "2024-01-02", "count": 15 }
  ]
}
```

## GET /dashboard/usage/monthly

Returns last 12 months of monthly usage (legacy format).

### Response

```json
{
  "ok": true,
  "months": [
    { "month": "2024-01", "count": 300 },
    { "month": "2024-02", "count": 250 }
  ]
}
```

## GET /dashboard/events/recent

Returns the most recent 50 analytics events for activity feed.

### Response

```json
{
  "ok": true,
  "events": [
    {
      "event": "alttext_generated",
      "created_at": "2024-01-20T00:00:00Z",
      "meta": {
        "image_url": "https://example.com/image.jpg"
      }
    }
  ]
}
```

## GET /dashboard/plugins/activity

Returns plugin activity sorted by `last_seen_at` DESC.

### Response

```json
{
  "ok": true,
  "plugins": [
    {
      "plugin_slug": "alttext-ai",
      "last_seen_at": "2024-01-20T00:00:00Z",
      "site_url": "https://example.com"
    }
  ]
}
```

## GET /dashboard/analytics

Returns chart-ready analytics data with time range support.

### Query Parameters

- `range` (optional) - Time range: `'1d'`, `'7d'`, or `'30d'` (default: `'30d'`)

### Response

```json
{
  "ok": true,
  "usage": [
    { "date": "2024-01-01", "count": 10 }
  ],
  "activations": {
    "total": 5,
    "recent": 2,
    "rate": 40.0
  },
  "altTextGenerations": 150,
  "versions": [
    { "version": "1.0.0", "count": 3 },
    { "version": "0.9.0", "count": 2 }
  ],
  "timeRange": 30
}
```

## Services Used

- `identityService.getIdentityDashboard()` - Gets installations and usage
- `billingService.getSubscriptionForEmail()` - Gets subscription data
- `creditsService.getBalanceByEmail()` - Gets credit balance
- `creditsService.getTransactionsByEmail()` - Gets transaction history
- `usageService.getUsageSummary()` - Gets usage statistics
- `dashboardChartsService.getDashboardCharts()` - Gets chart data

## Caching Strategy

- **Main dashboard**: 45 seconds cache
- **Subscription data**: 30 seconds cache (in billingService)
- **Chart data**: 5 minutes cache (in dashboardService)

Cache is automatically cleared when:
- Subscription is updated/canceled
- Credits are purchased/spent
- Dashboard data is explicitly cleared

## Best Practices

1. **Use /dashboard/charts for chart data** - Single call instead of multiple
2. **Handle empty arrays gracefully** - All arrays are always present
3. **Check subscriptionStatus** - Don't rely solely on subscription object
4. **Cache on client side** - Dashboard data changes infrequently
5. **Handle errors gracefully** - Dashboard should never be blank

## Error Handling

All endpoints return standardized error format:

```json
{
  "ok": false,
  "code": "DASHBOARD_ERROR",
  "reason": "server_error",
  "message": "Failed to load dashboard"
}
```

Errors are logged but don't crash the server - endpoints return defaults on failure.

