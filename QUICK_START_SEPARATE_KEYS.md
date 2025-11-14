# Quick Start: Separate API Keys Setup

## TL;DR

You can now use **separate OpenAI API keys for each WordPress plugin** by setting environment variables in Render.

## In Render Dashboard (5 minutes)

1. Go to your service: [Render Dashboard](https://dashboard.render.com/)
2. Click **Environment**
3. Add these variables:

```
ALTTEXT_OPENAI_API_KEY = sk-proj-your-alttext-key
SEO_META_OPENAI_API_KEY = sk-proj-your-seo-meta-key
```

4. Click **Save** (Render will auto-deploy)

## Benefits

✅ **Separate billing** - Track costs per plugin in OpenAI dashboard
✅ **Better security** - No API keys stored in WordPress database
✅ **Separate rate limits** - Each plugin can have different limits
✅ **Different organizations** - Use different OpenAI orgs if needed

## How It Works

### Current Setup (Before Changes)

```
WordPress Plugin → OpenAI API (directly)
├── API Key stored in WordPress database
└── Visible in WordPress admin settings
```

### New Setup (After Changes)

```
WordPress Plugin → Backend Service → OpenAI API
├── Plugin sends 'service' identifier
├── Backend selects correct API key from Render env vars
└── No API keys stored in WordPress
```

## Implementation Status

### ✅ Backend Service (Already Updated)

The backend service (`/Users/.../wp-alt-text-ai/backend-service/server.js`) now:
- Accepts `service` parameter in requests
- Selects API key based on service:
  - `service: 'alttext-ai'` → Uses `ALTTEXT_OPENAI_API_KEY`
  - `service: 'seo-ai-meta'` → Uses `SEO_META_OPENAI_API_KEY`
  - No service → Uses `OPENAI_API_KEY` (fallback)

### 🔄 WordPress Plugins (Next Steps)

The WordPress plugins need to be updated to send the `service` parameter. This depends on your architecture:

#### Option A: Plugins Already Use Backend Service

If your plugins already make requests to the backend service (recommended):
- Just add `service: 'plugin-name'` to the request payload
- No other changes needed

#### Option B: Plugins Call OpenAI Directly

If your plugins currently call OpenAI API directly:
1. Update them to call your backend service instead
2. Backend handles API key selection
3. More secure and easier to manage

## Architecture Recommendations

### Recommended: Use Backend Service for Both Plugins

```
┌─────────────────────┐
│  AltText AI Plugin  │───┐
└─────────────────────┘   │
                          ▼
                    ┌──────────────────┐      ┌─────────────┐
                    │ Backend Service  │─────▶│  OpenAI API │
                    │ (Render)         │      └─────────────┘
┌─────────────────────┐   │
│ SEO Meta Generator  │───┘
└─────────────────────┘

Backend selects key based on 'service' parameter:
- ALTTEXT_OPENAI_API_KEY
- SEO_META_OPENAI_API_KEY
```

**Benefits:**
- API keys never exposed to WordPress
- Centralized rate limiting
- Easier monitoring and logging
- Better security

### Alternative: Direct OpenAI Calls with PHP Constants

```
┌─────────────────────┐
│  AltText AI Plugin  │─────▶ OpenAI API (uses WP constant)
└─────────────────────┘

┌─────────────────────┐
│ SEO Meta Generator  │─────▶ OpenAI API (uses WP constant)
└─────────────────────┘

In wp-config.php:
define('ALTTEXT_OPENAI_KEY', getenv('ALTTEXT_OPENAI_API_KEY'));
define('SEO_META_OPENAI_KEY', getenv('SEO_META_OPENAI_API_KEY'));
```

**Benefits:**
- Simpler setup (no backend needed)
- Keys still in environment variables
- Each plugin uses its own constant

**Drawbacks:**
- API keys exposed to WordPress environment
- Must set env vars on WordPress hosting
- Less centralized control

## Current Plugin Architecture

### AltText AI Plugin
- ✅ Uses backend service ([alttext-ai-backend.onrender.com](https://alttext-ai-backend.onrender.com))
- ✅ Already sends requests to `/api/generate`
- 🔄 Needs to add `service: 'alttext-ai'` parameter

### SEO AI Meta Generator Plugin
- Uses `class-openai-client.php` (direct OpenAI calls)
- ❓ Check if it also uses backend service via `class-api-client-v2.php`

## Next Steps

### 1. Set Render Environment Variables (Do This Now)

```bash
# Using Render CLI
render env set ALTTEXT_OPENAI_API_KEY="sk-proj-xxx" --service alttext-ai-backend
render env set SEO_META_OPENAI_API_KEY="sk-proj-yyy" --service alttext-ai-backend

# Or use Render Dashboard (easier)
```

### 2. Update WordPress Plugins to Send Service Parameter

#### For Plugins Using Backend Service

Add `service` to the request payload:

```javascript
// In WordPress plugin JavaScript
fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        domain: 'example.com',
        image_data: {...},
        context: {...},
        service: 'alttext-ai'  // ← Add this
    })
})
```

```php
// In WordPress plugin PHP
$response = wp_remote_post($api_url, array(
    'body' => wp_json_encode(array(
        'domain' => get_site_url(),
        'image_data' => $image_data,
        'context' => $context,
        'service' => 'seo-ai-meta'  // ← Add this
    ))
));
```

### 3. Test the Setup

```bash
# Monitor Render logs while testing
render logs --service alttext-ai-backend --tail

# Test AltText AI in WordPress
# → Should see: "Using API key for service: alttext-ai"

# Test SEO Meta Generator in WordPress
# → Should see: "Using API key for service: seo-ai-meta"
```

## Verify Current Setup

### Check Which Plugins Use Backend Service

```bash
cd /path/to/wp-alt-text-ai/WP-Alt-text-plugin
grep -r "api/generate" .
grep -r "alttext-ai-backend" .

cd /path/to/seo-ai-meta-generator
grep -r "api/generate" .
grep -r "alttext-ai-backend" .
```

### Check Backend Service Usage

```bash
# Check backend logs to see incoming requests
render logs --service alttext-ai-backend --tail

# Look for:
# - Which endpoints are being called
# - What service parameter is sent (if any)
```

## Rollback Plan

If something goes wrong:

1. **Keep fallback key:** Don't remove `OPENAI_API_KEY` until everything works
2. **Test one plugin at a time:** Set up AltText AI first, then SEO Meta
3. **Monitor costs:** Check OpenAI dashboard to verify correct keys are being used

## FAQ

**Q: Do I need to set up both service-specific keys?**
A: No, you can start with just one. If `ALTTEXT_OPENAI_API_KEY` isn't set, it will use `OPENAI_API_KEY` as fallback.

**Q: Can I use the same key for both plugins?**
A: Yes, just set `OPENAI_API_KEY` and don't set service-specific keys.

**Q: Will this break my existing setup?**
A: No, the backend still supports the old way (no service parameter). It's backward compatible.

**Q: Do I need to remove API keys from WordPress?**
A: Recommended for security, but not required. The backend keys take priority.

## Summary

1. ✅ Backend service updated (already done)
2. ⏳ Add environment variables in Render (5 minutes)
3. ⏳ Update plugins to send `service` parameter (if needed)
4. ✅ Test and verify (10 minutes)

Total time: ~15-20 minutes

For detailed setup instructions, see [SEPARATE_API_KEYS_SETUP.md](./SEPARATE_API_KEYS_SETUP.md)
