# Identity Sync System

## Overview

The identity sync system provides a unified way for plugins and websites to synchronize user identity and installation data with the backend. It handles both identity creation/updates and plugin installation tracking.

## identityService

**Location:** `src/services/identityService.js`

### syncIdentity Method

The core method for synchronizing identity and installation data.

#### Signature

```javascript
async function syncIdentity(data) {
  // Returns: { success: boolean, identity?: Object, error?: string }
}
```

#### Parameters

- `email` (required) - User email address
- `plugin` (optional) - Plugin slug (e.g., 'alttext-ai', 'seo-ai-meta')
- `site` (optional) - Site URL where plugin is installed
- `version` (optional) - Plugin version
- `wpVersion` (optional) - WordPress version
- `phpVersion` (optional) - PHP version

#### Behavior

1. **Normalizes email** to lowercase
2. **Gets or creates unified identity** from `identities` table via `creditsService.getOrCreateIdentity()`
3. **Upserts plugin installation** if plugin is provided via `pluginInstallationService.recordInstallation()`
4. **Fetches full identity** with all installations
5. **Returns complete identity object** with installations array

#### Return Value

```javascript
{
  success: true,
  identity: {
    id: "uuid",
    email: "user@example.com",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    installations: [
      {
        id: "uuid",
        email: "user@example.com",
        plugin_slug: "alttext-ai",
        site_url: "https://example.com",
        version: "1.0.0",
        wp_version: "6.4",
        php_version: "8.2",
        last_seen_at: "2024-01-01T00:00:00Z",
        // ... other fields
      }
    ]
  }
}
```

### Other Methods

- `getOrCreateIdentity(email, plugin, site)` - Legacy method for plugin-specific identities
- `getIdentityDashboard(email)` - Gets dashboard data for an identity
- `normalizeEmail(email)` - Normalizes email to lowercase

## plugin_installations Table

The `plugin_installations` table tracks WordPress plugin installations across sites.

### Schema

- `id` - UUID primary key
- `email` - User email (indexed, lowercase)
- `plugin_slug` - Plugin identifier (e.g., 'alttext-ai')
- `site_url` - Site URL where plugin is installed
- `version` - Plugin version
- `wp_version` - WordPress version
- `php_version` - PHP version
- `language` - Language code (optional)
- `timezone` - Timezone (optional)
- `install_source` - Installation source (default: 'plugin')
- `last_seen_at` - Last sync timestamp (auto-updated)
- `created_at` - Creation timestamp
- `updated_at` - Update timestamp

### Upsert Logic

Installations are upserted based on:
- `email` + `plugin_slug` + `site_url` combination

If an installation exists with the same email, plugin, and site URL, it's updated. Otherwise, a new record is created.

## syncIdentity Route

**Endpoint:** `POST /identity/sync`

**Location:** `src/routes/identity.js`

### Request

#### Headers

- `Content-Type: application/json`

#### Body

```json
{
  "email": "user@example.com",
  "plugin": "alttext-ai",
  "site": "https://example.com",
  "version": "1.0.0",
  "wpVersion": "6.4",
  "phpVersion": "8.2"
}
```

#### Validation

Validated using `identitySyncSchema` from `src/validation/identitySchemas.js`:

- `email` - Required, must be valid email format
- `plugin` - Optional, string with min length 1
- `site` - Optional, must be valid URL or empty string
- `version` - Optional, string
- `wpVersion` - Optional, string
- `phpVersion` - Optional, string

### Response

#### Success (200)

```json
{
  "ok": true,
  "identity": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "installations": [
      {
        "id": "uuid",
        "email": "user@example.com",
        "plugin_slug": "alttext-ai",
        "site_url": "https://example.com",
        "version": "1.0.0",
        "wp_version": "6.4",
        "php_version": "8.2",
        "last_seen_at": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

#### Validation Error (400)

```json
{
  "ok": false,
  "code": "VALIDATION_ERROR",
  "reason": "validation_failed",
  "message": "Request validation failed",
  "details": {
    "fieldErrors": {
      "email": ["Invalid email format"]
    }
  }
}
```

#### Server Error (500)

```json
{
  "ok": false,
  "code": "SYNC_ERROR",
  "reason": "server_error",
  "message": "Failed to sync identity"
}
```

## Metadata Fields

### Installation Metadata

The `plugin_installations` table stores the following metadata:

- **version** - Plugin version (e.g., "1.0.0")
- **wp_version** - WordPress version (e.g., "6.4")
- **php_version** - PHP version (e.g., "8.2")
- **language** - Language code (e.g., "en_US")
- **timezone** - Timezone (e.g., "America/New_York")
- **install_source** - Source of installation (default: "plugin")

### Identity Metadata

The `identities` table stores:

- **email** - User email (primary identifier)
- **credits_balance** - Cached credit balance (updated by eventService)
- **created_at** - Identity creation timestamp
- **updated_at** - Last update timestamp

## Usage Examples

### Plugin Sync

```javascript
// WordPress plugin calling sync endpoint
async function syncWithBackend() {
  const response = await fetch('https://api.example.com/identity/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: userEmail,
      plugin: 'alttext-ai',
      site: window.location.origin,
      version: pluginVersion,
      wpVersion: wpVersion,
      phpVersion: phpVersion
    })
  });

  const data = await response.json();
  if (data.ok) {
    console.log('Identity synced:', data.identity);
    return data.identity;
  } else {
    console.error('Sync failed:', data.message);
    return null;
  }
}
```

### Website Sync

```javascript
// Website calling sync endpoint
async function syncUserIdentity(email) {
  const response = await fetch('https://api.example.com/identity/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email
      // No plugin/site info for website-only sync
    })
  });

  return await response.json();
}
```

## Integration Points

### Services Used

- `creditsService.getOrCreateIdentity()` - Gets or creates unified identity
- `pluginInstallationService.recordInstallation()` - Upserts plugin installation

### Database Tables

- `identities` - Unified identity table
- `plugin_installations` - Plugin installation tracking

## Best Practices

1. **Call sync on plugin activation** - Sync when plugin is activated
2. **Call sync periodically** - Sync on plugin updates or version changes
3. **Include all version info** - Provide plugin, WordPress, and PHP versions
4. **Handle errors gracefully** - Sync failures shouldn't break plugin functionality
5. **Use email normalization** - Always use lowercase emails
6. **Update last_seen_at** - Automatically updated on each sync

## Related Endpoints

- `GET /identity/me?identityId=<uuid>` - Get full identity profile with all related data

