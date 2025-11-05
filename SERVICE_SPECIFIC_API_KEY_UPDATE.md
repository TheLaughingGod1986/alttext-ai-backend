# Service-Specific API Key Implementation

## Overview

Updated the backend to support service-specific OpenAI API keys, allowing the same backend to serve multiple plugins (AltText AI and SEO AI Meta) with different API keys.

## Changes Made

### Backend Changes (server-v2.js)

#### 1. `/api/generate` endpoint
- Added `service` parameter extraction from request body (defaults to `'alttext-ai'`)
- Implemented API key selection logic:
  - `service === 'seo-ai-meta'` → uses `SEO_META_OPENAI_API_KEY`
  - `service === 'alttext-ai'` → uses `ALTTEXT_OPENAI_API_KEY`
- Added validation to return 500 error if the required API key is not configured

#### 2. `/api/review` endpoint
- Added `service` parameter extraction from request body (defaults to `'alttext-ai'`)
- Implemented API key selection with fallback:
  - `service === 'seo-ai-meta'` → uses `OPENAI_REVIEW_API_KEY` or `SEO_META_OPENAI_API_KEY`
  - `service === 'alttext-ai'` → uses `OPENAI_REVIEW_API_KEY` or `ALTTEXT_OPENAI_API_KEY`
- Updated `reviewAltText()` function signature to accept optional `apiKey` parameter

#### 3. Helper Function Updates
- Modified `reviewAltText()` to accept and use service-specific API key
- Maintained backward compatibility with fallback to environment variables

### Plugin Verification

Verified that the WordPress plugin already sends the correct service identifier:
- [class-api-client-v2.php:399](../WP-Alt-text-plugin/includes/class-api-client-v2.php#L399): `'service' => 'alttext-ai'`
- [class-api-client-v2.php:498](../WP-Alt-text-plugin/includes/class-api-client-v2.php#L498): `'service' => 'alttext-ai'`

**No plugin changes required** - the plugin already sends the service identifier correctly.

## Environment Variables Required

### On Render Dashboard

Ensure these environment variables are configured in your Render service:

```
ALTTEXT_OPENAI_API_KEY=sk-proj-W8o-...  (Your AltText AI OpenAI key)
SEO_META_OPENAI_API_KEY=sk-proj-skizpk... (Your SEO AI Meta OpenAI key)
```

**Optional** (for review endpoint, uses generation key if not set):
```
OPENAI_REVIEW_API_KEY=sk-...  (Shared review key, optional)
```

## Deployment Steps

### 1. Verify Environment Variables on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Navigate to your service: `alttext-ai-backend`
3. Go to **Environment** tab
4. Verify these variables exist:
   - ✅ `ALTTEXT_OPENAI_API_KEY`
   - ✅ `SEO_META_OPENAI_API_KEY`

### 2. Deploy Backend Changes

**Option A: Deploy via Git (Recommended)**
```bash
cd ../alttext-ai-backend-clone
git add server-v2.js
git commit -m "Add service-specific OpenAI API key support

- Support ALTTEXT_OPENAI_API_KEY for alttext-ai service
- Support SEO_META_OPENAI_API_KEY for seo-ai-meta service
- Add validation for missing API keys
- Update review endpoint to use service-specific keys"
git push
```

Render will automatically detect the push and redeploy.

**Option B: Manual Redeploy**
1. In Render Dashboard, go to your service
2. Click **Manual Deploy** → **Deploy latest commit**

### 3. Monitor Deployment

1. Watch the deployment logs in Render
2. Wait for "Build successful" and "Live" status
3. Expected deployment time: 2-3 minutes

### 4. Verify Backend is Working

```bash
# Check health endpoint
curl https://alttext-ai-backend.onrender.com/health

# Expected response:
# {"status":"ok","timestamp":"2025-11-05T...","version":"2.0.0","phase":"monetization"}
```

## Testing

### Test Alt Text Generation

1. Go to WordPress admin: http://localhost:8080/wp-admin/upload.php?page=ai-alt-gpt
2. Navigate to the **Dashboard** tab
3. Find an image without alt text
4. Click **"Generate Alt Text"**
5. Verify:
   - ✅ No 500 errors in browser console
   - ✅ Alt text is generated successfully
   - ✅ Usage counter updates

### Test from Docker Logs

```bash
# Watch WordPress logs for any errors
docker logs wp-alt-text-plugin-wordpress-1 -f

# Should NOT see:
# ❌ "Missing OpenAI API key"
# ❌ "GENERATION_ERROR"
# ❌ Status: 500
```

### Verify Service Selection

The backend will now:
- Log which service is being used
- Use `ALTTEXT_OPENAI_API_KEY` when service is `'alttext-ai'`
- Use `SEO_META_OPENAI_API_KEY` when service is `'seo-ai-meta'`
- Return clear error message if the API key for the requested service is missing

## Error Handling

### If API Key is Missing

The backend now returns a clear error message:

```json
{
  "error": "Failed to generate alt text",
  "code": "GENERATION_ERROR",
  "message": "Missing OpenAI API key for service: alttext-ai"
}
```

This helps identify configuration issues immediately.

### Troubleshooting

**Issue: Still getting "Missing OpenAI API key" error**

1. Check Render environment variables:
   ```bash
   # In Render Dashboard → Environment tab
   # Verify ALTTEXT_OPENAI_API_KEY is set
   ```

2. Redeploy the service:
   - Environment variable changes require a redeploy
   - Click "Manual Deploy" → "Clear build cache & deploy"

3. Check backend logs in Render:
   - Look for startup logs
   - Verify no errors loading environment variables

**Issue: Wrong API key being used**

1. Verify plugin sends correct service identifier:
   ```php
   // Should be in request body:
   'service' => 'alttext-ai'
   ```

2. Check backend logs for which service it detected

## Benefits

### 1. **Multi-Plugin Support**
- Same backend can serve multiple WordPress plugins
- Each plugin uses its own OpenAI API key
- Usage tracked separately per service

### 2. **Cost Management**
- Separate API keys = separate billing
- Can track costs per plugin/service
- Easier to set different rate limits

### 3. **Better Error Messages**
- Clear identification when API key is missing
- Specifies which service needs configuration
- Easier troubleshooting

### 4. **Backward Compatible**
- Old environment variables still work as fallbacks
- No breaking changes for existing deployments
- Gradual migration path

## Next Steps

1. ✅ **Deploy backend to Render**
2. ✅ **Test alt text generation in WordPress**
3. ✅ **Monitor usage and costs per service**
4. Consider adding:
   - Service-specific model selection
   - Service-specific rate limits
   - Usage analytics per service

## Related Files

- Backend: `server-v2.js` (lines 57-121, 187-218, 442-491)
- Plugin: `includes/class-api-client-v2.php` (lines 399, 498)
- Documentation: This file

## Support

If you encounter issues:
1. Check Render deployment logs
2. Verify environment variables are set correctly
3. Test the health endpoint
4. Review WordPress error logs
5. Check browser console for API errors
