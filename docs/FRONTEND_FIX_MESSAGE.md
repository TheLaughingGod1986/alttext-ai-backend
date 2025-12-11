# Quick Fix Message for Frontend Developer

## Problem
API requests are failing with: **"License key required"**

## Solution
Add the `X-License-Key` header to **all API requests** to the backend.

## What to Change

### Before (Missing Header):
```javascript
fetch('https://alttext-ai-backend.onrender.com/api/alt-text', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ image: {...} })
});
```

### After (With License Key):
```javascript
fetch('https://alttext-ai-backend.onrender.com/api/alt-text', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-License-Key': 'YOUR_LICENSE_KEY_HERE'  // ← ADD THIS
  },
  body: JSON.stringify({ image: {...} })
});
```

## Required Header Details

- **Header Name:** `X-License-Key` (case-sensitive, exact spelling)
- **Value:** The license UUID stored in your plugin settings
- **Where:** Add to **every** API request (except `/health` and `/ready`)

## Where to Get the License Key

The license key should be stored in your WordPress plugin settings/database. It's a UUID like:
```
24c93235-1053-4922-b337-9866aeb76dcc
```

## Test It

```bash
curl -X POST https://alttext-ai-backend.onrender.com/api/alt-text \
  -H "Content-Type: application/json" \
  -H "X-License-Key: YOUR_LICENSE_KEY" \
  -d '{"image":{"base64":"..."}}'
```

## Full Documentation

See [Frontend Integration Guide](./FRONTEND_INTEGRATION.md) for complete details, examples, and troubleshooting.
