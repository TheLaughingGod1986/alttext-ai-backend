# Frontend Integration Guide - License Key Authentication

## Issue: "License key required" Error

The backend API requires a **license key** to be sent in every API request. If you're seeing "License key required" errors, the frontend is not sending the required header.

## Required Header

**Header Name:** `X-License-Key`  
**Value:** The license key UUID (e.g., `24c93235-1053-4922-b337-9866aeb76dcc`)

## How to Fix

### 1. Get the License Key

The license key should be stored in your WordPress plugin settings/database. It's a UUID format string that looks like:
```
24c93235-1053-4922-b337-9866aeb76dcc
```

### 2. Add Header to All API Requests

You need to add the `X-License-Key` header to **every API request** to the backend.

#### JavaScript/WordPress PHP Example:

```javascript
// JavaScript/AJAX example
fetch('https://alttext-ai-backend.onrender.com/api/alt-text', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-License-Key': 'YOUR_LICENSE_KEY_HERE',  // ← REQUIRED
    'X-Site-Key': 'your-site-hash',            // Optional but recommended
  },
  body: JSON.stringify({
    image: { base64: '...' }
  })
});
```

```php
// WordPress PHP example
$response = wp_remote_post('https://alttext-ai-backend.onrender.com/api/alt-text', [
  'headers' => [
    'Content-Type' => 'application/json',
    'X-License-Key' => get_option('alttext_ai_license_key'), // ← REQUIRED
    'X-Site-Key' => md5(get_site_url()),                     // Optional but recommended
  ],
  'body' => json_encode([
    'image' => ['base64' => '...']
  ])
]);
```

### 3. All Required Headers

For the `/api/alt-text` endpoint, send:

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `X-License-Key` | **YES** | The license UUID from database | `24c93235-1053-4922-b337-9866aeb76dcc` |
| `Content-Type` | **YES** | Must be `application/json` | `application/json` |
| `X-Site-Key` | Optional | Site identifier (MD5 hash) | `abc123def456...` |
| `X-WP-User-ID` | Optional | WordPress user ID | `123` |
| `X-WP-User-Email` | Optional | WordPress user email | `user@example.com` |

## Testing

### Test with cURL:

```bash
curl -X POST https://alttext-ai-backend.onrender.com/api/alt-text \
  -H "Content-Type: application/json" \
  -H "X-License-Key: YOUR_LICENSE_KEY_HERE" \
  -H "X-Site-Key: test-site-123" \
  -d '{
    "image": {
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9p0Y2ZAAAAAASUVORK5CYII=",
      "width": 1,
      "height": 1
    }
  }'
```

### Expected Success Response:

```json
{
  "altText": "...",
  "credits_used": 1,
  "credits_remaining": 49,
  "usage": { ... }
}
```

### Current Error (if header missing):

```json
{
  "error": "INVALID_LICENSE",
  "message": "License key required. Please send X-License-Key header with your license key.",
  "hint": "Check your plugin settings to ensure the license key is configured correctly."
}
```

## Common Issues

### ❌ Wrong Header Name
- `License-Key` → Wrong
- `x-license-key` → Wrong (case-sensitive)
- `X-LICENSE-KEY` → Wrong
- ✅ `X-License-Key` → Correct

### ❌ Missing Header
- Not including the header at all → Will get "License key required" error

### ❌ Wrong License Key Format
- The license key must be a valid UUID format
- Check your database/plugin settings for the correct value

## Where to Find the License Key

1. **WordPress Plugin Settings**: Check the plugin's settings page where the license was activated
2. **Database**: Query the `licenses` table in Supabase/PostgreSQL
3. **Plugin Options**: Check WordPress options table: `wp_options` where `option_name` contains 'license' or 'alttext'

## API Endpoints That Require License Key

All endpoints except `/health` and `/ready` require the `X-License-Key` header:

- ✅ `POST /api/alt-text` - Generate alt text
- ✅ `POST /api/jobs` - Batch processing
- ✅ `GET /api/usage` - Usage statistics
- ✅ `GET /usage/sites` - Site usage
- ✅ `GET /usage/users` - User usage
- ❌ `GET /health` - No auth required
- ❌ `GET /ready` - No auth required

## Questions?

If you're still getting errors after adding the header:
1. Check the Render logs for debug messages showing what headers were received
2. Verify the license key value matches what's in the database
3. Ensure the header name is exactly `X-License-Key` (case-sensitive)
