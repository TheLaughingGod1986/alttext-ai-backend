# Analytics System

## Overview

The analytics system provides event logging and analytics aggregation for tracking user behavior, plugin usage, and system events. Events are stored in the `analytics_events` table and can be queried for dashboards and reporting.

## Event Logging

### POST /analytics/event

Logs one or more analytics events. Supports both single events and batch processing.

#### Request

**Single Event:**
```json
{
  "email": "user@example.com",
  "eventName": "alttext_generated",
  "plugin": "alttext-ai",
  "source": "plugin",
  "eventData": {
    "image_url": "https://example.com/image.jpg",
    "success": true
  },
  "identityId": "uuid-optional"
}
```

**Batch Events (Array):**
```json
[
  {
    "email": "user@example.com",
    "eventName": "alttext_generated",
    "plugin": "alttext-ai",
    "source": "plugin"
  },
  {
    "email": "user@example.com",
    "eventName": "plugin_activated",
    "plugin": "alttext-ai",
    "source": "plugin"
  }
]
```

#### Validation

Events are validated using Zod schema (`analyticsEventSchema`):

- **email** (required) - Valid email format
- **eventName** (required) - Non-empty string
- **plugin** (optional) - Plugin identifier
- **source** (optional) - 'plugin', 'website', or 'server'
- **eventData** (optional) - Any JSON object
- **identityId** (optional) - UUID format

**Batch Limits:**
- Minimum: 1 event
- Maximum: 100 events per batch

#### Response

**Success (Single Event):**
```json
{
  "ok": true
}
```

**Success (Batch):**
```json
{
  "ok": true,
  "total": 10,
  "successful": 9,
  "failed": 1,
  "errors": [
    {
      "index": 5,
      "error": "Validation failed"
    }
  ]
}
```

**Error:**
```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "details": {
    "fieldErrors": {
      "email": ["Invalid email format"]
    }
  }
}
```

#### Always Returns 200

The endpoint always returns HTTP 200 status to prevent analytics failures from breaking user flows. Check the `ok` field in the response to determine success.

### POST /analytics/log

Legacy endpoint for backward compatibility. Same functionality as `/analytics/event` but only accepts single events.

## Event Types

### Common Event Names

- **`alttext_generated`** - Alt text was generated for an image
- **`plugin_activated`** - Plugin was activated
- **`plugin_deactivated`** - Plugin was deactivated
- **`plugin_updated`** - Plugin was updated
- **`subscription_created`** - Subscription was created
- **`subscription_canceled`** - Subscription was canceled
- **`credit_purchased`** - Credits were purchased
- **`credit_used`** - Credits were used

### Event Data Structure

Event data can contain any JSON object. Common fields:

```json
{
  "image_url": "https://example.com/image.jpg",
  "success": true,
  "error": "Error message if failed",
  "plugin_version": "1.0.0",
  "wp_version": "6.4",
  "php_version": "8.2"
}
```

## Analytics Summary

### GET /analytics/summary

Returns analytics summary for dashboard charts.

#### Query Parameters

- **email** (required) - User email
- **days** (optional) - Number of days to include (default: 30)
- **startDate** (optional) - Start date (ISO format)
- **endDate** (optional) - End date (ISO format)
- **eventNames** (optional) - Comma-separated list of event names to filter

#### Response

**Full Summary:**
```json
{
  "ok": true,
  "summary": {
    "totalEvents": 150,
    "eventsByType": {
      "alttext_generated": 100,
      "plugin_activated": 50
    },
    "eventsByDate": [
      {
        "date": "2024-01-01",
        "count": 10
      }
    ],
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    }
  }
}
```

**Event Counts (with eventNames parameter):**
```json
{
  "ok": true,
  "counts": {
    "alttext_generated": 100,
    "plugin_activated": 50
  },
  "dateRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  }
}
```

## Rate Limiting

Analytics endpoints are rate-limited to prevent abuse:

- **IP-based rate limiting** - 100 requests per minute per IP
- **Throttling** - Uses client IP address for tracking

Rate limiting is enforced via middleware in `server-v2.js`.

## Database Schema

### analytics_events Table

- `id` - UUID primary key
- `email` - User email (indexed, lowercase)
- `event_name` - Event type/name (indexed)
- `plugin` - Plugin identifier
- `source` - Event source ('plugin', 'website', 'server')
- `event_data` - JSON metadata
- `identity_id` - Foreign key to identities table (optional)
- `ip_address` - Client IP address (for rate limiting)
- `created_at` - Timestamp (indexed)

### Indexes

- `email` - For user-specific queries
- `event_name` - For event type filtering
- `created_at` - For date range queries
- `(email, event_name, created_at)` - Composite index for common queries

## Analytics Service

**Location:** `src/services/analyticsService.js`

### logEvent Method

Logs a single analytics event:

```javascript
async function logEvent({ email, eventName, plugin, source, eventData, identityId, ip })
```

### logEvents Method

Logs multiple events in batch:

```javascript
async function logEvents(events, clientIp)
```

Returns:
```javascript
{
  success: boolean,
  total: number,
  successful: number,
  failed: number,
  errors: Array<{ index: number, error: string }>
}
```

### getAnalyticsSummary Method

Gets analytics summary for a user:

```javascript
async function getAnalyticsSummary(email, options = {})
```

Options:
- `days` - Number of days
- `startDate` - Start date
- `endDate` - End date

### getEventCounts Method

Gets event counts for specific event names:

```javascript
async function getEventCounts(email, eventNames, options = {})
```

## Validation

**Location:** `src/validation/analyticsEventSchema.js`

Uses Zod for schema validation:

- **analyticsEventSchema** - Single event validation
- **analyticsEventArraySchema** - Array of events (1-100 events)
- **analyticsEventOrArraySchema** - Union type (single or array)

## Best Practices

1. **Always check `ok` field** - Don't rely on HTTP status code
2. **Use batch processing** - Log multiple events in one call when possible
3. **Include metadata** - Add relevant context in `eventData`
4. **Handle errors gracefully** - Analytics failures shouldn't break user flows
5. **Use consistent event names** - Follow naming conventions
6. **Include source** - Specify 'plugin', 'website', or 'server'
7. **Rate limit on client** - Don't spam the analytics endpoint

## Error Handling

All endpoints return standardized format:

```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "details": {}
}
```

Common error codes:
- `VALIDATION_ERROR` - Request validation failed
- `UNEXPECTED_ERROR` - Unexpected server error

## Integration Examples

### WordPress Plugin

```javascript
async function logAnalyticsEvent(eventName, eventData) {
  try {
    const response = await fetch('https://api.example.com/analytics/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: userEmail,
        eventName: eventName,
        plugin: 'alttext-ai',
        source: 'plugin',
        eventData: eventData
      })
    });

    const data = await response.json();
    if (!data.ok) {
      console.warn('Analytics logging failed:', data.error);
    }
  } catch (error) {
    console.error('Analytics error:', error);
    // Don't throw - analytics failures shouldn't break functionality
  }
}
```

### Batch Logging

```javascript
const events = [
  { email: 'user@example.com', eventName: 'alttext_generated', plugin: 'alttext-ai', source: 'plugin' },
  { email: 'user@example.com', eventName: 'plugin_activated', plugin: 'alttext-ai', source: 'plugin' }
];

const response = await fetch('https://api.example.com/analytics/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(events)
});
```

## Related Services

- `analyticsService` - Event logging and aggregation
- `eventService` - Unified events table (includes credit events)
- `dashboardChartsService` - Chart data aggregation

