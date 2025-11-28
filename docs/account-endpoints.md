# Account Endpoints Documentation

## Overview

The account endpoints provide aggregated user data for the Optti dashboard, including installations, plugins, and sites. These endpoints are consumed by the Next.js dashboard frontend.

## Base URL

All endpoints are prefixed with `/account`.

## Endpoints

### POST /account/overview

Returns full account data including installations, plugins, and sites for a user.

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Validation:**
- `email` (required): Valid email address format

#### Response

**Success (200):**
```json
{
  "ok": true,
  "data": {
    "email": "user@example.com",
    "installations": [
      {
        "email": "user@example.com",
        "plugin_slug": "alttext-ai",
        "site_url": "https://example.com",
        "version": "1.0.0",
        "wp_version": "6.0",
        "php_version": "8.0",
        "language": "en_US",
        "timezone": "America/New_York",
        "install_source": "plugin",
        "last_seen_at": "2025-01-26T12:00:00Z",
        "created_at": "2025-01-01T10:00:00Z"
      }
    ],
    "plugins": [
      {
        "email": "user@example.com",
        "plugin_slug": "alttext-ai",
        "install_count": 2,
        "last_active": "2025-01-26T12:00:00Z",
        "first_seen": "2025-01-01T10:00:00Z",
        "sites": ["https://example.com", "https://another.com"]
      }
    ],
    "sites": [
      {
        "email": "user@example.com",
        "site_url": "https://example.com",
        "plugins": ["alttext-ai", "seo-ai-meta"],
        "last_seen": "2025-01-26T12:00:00Z"
      }
    ]
  }
}
```

**Error (400):**
```json
{
  "ok": false,
  "error": "Invalid email"
}
```

**Error (500):**
```json
{
  "ok": false,
  "error": "Failed to fetch account data"
}
```

#### Example cURL Request

```bash
curl -X POST https://api.optti.dev/account/overview \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

#### Use Cases

- Dashboard overview page showing all user data
- Account summary for user profile
- Initial data load for dashboard

---

### POST /account/installations

Returns all installations for a user.

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "email": "user@example.com"
}
```

**Validation:**
- `email` (required): Valid email address format

#### Response

**Success (200):**
```json
{
  "ok": true,
  "installations": [
    {
      "email": "user@example.com",
      "plugin_slug": "alttext-ai",
      "site_url": "https://example.com",
      "version": "1.0.0",
      "wp_version": "6.0",
      "php_version": "8.0",
      "language": "en_US",
      "timezone": "America/New_York",
      "install_source": "plugin",
      "last_seen_at": "2025-01-26T12:00:00Z",
      "created_at": "2025-01-01T10:00:00Z"
    },
    {
      "email": "user@example.com",
      "plugin_slug": "seo-ai-meta",
      "site_url": "https://another.com",
      "version": "2.0.0",
      "wp_version": "6.1",
      "php_version": "8.1",
      "language": "en_US",
      "timezone": "America/Los_Angeles",
      "install_source": "plugin",
      "last_seen_at": "2025-01-25T15:30:00Z",
      "created_at": "2025-01-15T09:00:00Z"
    }
  ]
}
```

**Error (400):**
```json
{
  "ok": false,
  "error": "Invalid email"
}
```

**Error (500):**
```json
{
  "ok": false,
  "error": "Failed to fetch installations"
}
```

#### Example cURL Request

```bash
curl -X POST https://api.optti.dev/account/installations \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'
```

#### Use Cases

- Installations list page
- Detailed installation view
- Installation management interface

---

## Rate Limiting

All account endpoints are rate-limited to **30 requests per 15 minutes** per IP address.

**Rate Limit Response (429):**
```json
{
  "message": "Too many account requests from this IP, please try again later."
}
```

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "ok": false,
  "error": "Error message description"
}
```

Common error codes:
- `400`: Validation error (invalid email format, missing required fields)
- `429`: Rate limit exceeded
- `500`: Internal server error (database connection issues, service failures)

## Data Models

### Installation Object

```typescript
{
  email: string;              // Normalized to lowercase
  plugin_slug: string;        // Plugin identifier (e.g., "alttext-ai")
  site_url: string | null;    // Site URL where plugin is installed
  version: string | null;     // Plugin version
  wp_version: string | null;  // WordPress version
  php_version: string | null; // PHP version
  language: string | null;    // Language code (e.g., "en_US")
  timezone: string | null;    // Timezone (e.g., "America/New_York")
  install_source: string;     // Installation source (default: "plugin")
  last_seen_at: string;       // ISO 8601 timestamp
  created_at: string;         // ISO 8601 timestamp
}
```

### Plugin Overview Object

```typescript
{
  email: string;              // Normalized to lowercase
  plugin_slug: string;       // Plugin identifier
  install_count: number;      // Number of installations
  last_active: string;        // ISO 8601 timestamp of most recent activity
  first_seen: string;         // ISO 8601 timestamp of first installation
  sites: string[];            // Array of distinct site URLs
}
```

### Site Overview Object

```typescript
{
  email: string;              // Normalized to lowercase
  site_url: string;          // Site URL
  plugins: string[];          // Array of plugin slugs installed on this site
  last_seen: string;          // ISO 8601 timestamp of most recent activity
}
```

## Notes

- All email addresses are normalized to lowercase before querying
- Empty arrays are returned when no data is found (not an error)
- All timestamps are in ISO 8601 format (UTC)
- The service never throws - all errors are returned as `{ success: false, error: '...' }`
- Database views are used for performance (prevents expensive SQL queries)

## Future Enhancements

The `getFullAccount` response includes placeholder fields for future Step 3 features:
- `billing`: Billing and subscription information
- `subscriptions`: Active subscriptions
- `usage`: Usage statistics and analytics

These fields are currently `null` or not included in the response.

