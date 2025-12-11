# Local Development Guide for fresh-stack

Fast setup for local WordPress plugin development with minimal latency.

## Quick Start (Fastest)

```bash
# Start server with quota checks disabled
SKIP_QUOTA_CHECK=true PORT=4000 node fresh-stack/server.js
```

This bypasses **all database queries** and provides:
- ⚡ **Instant responses** (no network latency to Supabase)
- 🚀 **Unlimited quota** (999,999 images)
- 🔥 **Perfect for rapid plugin development**

## Configure Your WordPress Plugin

Update your local WordPress plugin settings to point to:

```
API Endpoint: http://localhost:4000/api/alt-text
No authentication required (quota checks disabled)
```

## Performance Comparison

### With Quota Checks (Production mode)
```bash
# Normal mode with database quota checks
PORT=4000 node fresh-stack/server.js
```

**Request flow:**
1. License key validation → Supabase query (~50-100ms)
2. Site lookup/creation → Supabase query (~50-100ms)
3. Usage logs aggregation → Supabase query (~100-300ms)
4. Alt text generation → OpenAI API (~2-5s)

**Total time:** ~2.2-5.5 seconds per request

### With SKIP_QUOTA_CHECK=true (Development mode)
```bash
# Fast mode - no database queries
SKIP_QUOTA_CHECK=true PORT=4000 node fresh-stack/server.js
```

**Request flow:**
1. ~~License key validation~~ → **Skipped**
2. ~~Site lookup~~ → **Skipped**
3. ~~Usage logs~~ → **Skipped**
4. Alt text generation → OpenAI API (~2-5s)

**Total time:** ~2-5 seconds per request (saves 200-500ms per request)

**With quota caching** (after first request):
- Cache hit: ~1-5ms overhead
- Cache miss: ~200-500ms (then cached for 1 minute)

## Environment Variables

### Minimal (No DB, Fast Dev)
```bash
SKIP_QUOTA_CHECK=true
PORT=4000
```

### With OpenAI (Real Alt Text)
```bash
SKIP_QUOTA_CHECK=true
ALTTEXT_OPENAI_API_KEY=sk-...
PORT=4000
```

### Full Production Simulation
```bash
# Use .env file instead
cp .env.example .env
# Edit .env with your keys

PORT=4000 node fresh-stack/server.js
```

## Testing Network Performance

### Test response time:
```bash
curl -X POST http://localhost:4000/api/alt-text \
  -H "Content-Type: application/json" \
  -H "X-Site-Key: test-local" \
  -d '{"image":{"url":"https://picsum.photos/512/341"}}' \
  -w "\nTime: %{time_total}s\n"
```

### Expected timings:
- **SKIP_QUOTA_CHECK=true**: ~2-5s (OpenAI only)
- **Normal mode, cache hit**: ~2-5s + 1-5ms overhead
- **Normal mode, cache miss**: ~2-5s + 200-500ms (DB queries)

## Common Issues

### Issue: Still slow even with SKIP_QUOTA_CHECK=true

**Possible causes:**
1. **Large images without dimensions** → OpenAI uses full resolution (3,000+ tokens)
   - **Solution:** Send `width` and `height` in request
   - **Best practice:** Resize to 512px max before sending

2. **Base64 images too large** → Network transfer time
   - **Solution:** Use image URLs instead of base64
   - **Or:** Compress images before encoding

3. **OpenAI API slow** → Their API is having issues
   - **Solution:** Check OpenAI status page

### Issue: Getting 401 Unauthorized

**Cause:** You're not running with `SKIP_QUOTA_CHECK=true`

**Solution:**
```bash
# Make sure to set the env var
SKIP_QUOTA_CHECK=true node fresh-stack/server.js
```

### Issue: Getting validation errors about image size

**Cause:** Gray zone detection is rejecting your test images

**Solutions:**
1. Use properly sized test images (512px max dimension)
2. Include actual width/height in request
3. Temporarily disable validation in `lib/validation.js`

## Optimizing Plugin Performance

To get the fastest possible responses from your WordPress plugin:

1. **Resize images to 512px max** before sending
   ```php
   // In your plugin, resize images first
   $resized = wp_get_image_editor($image_path);
   $resized->resize(512, 512, false);
   ```

2. **Include dimensions in request**
   ```php
   $request_body = [
       'image' => [
           'base64' => $base64,
           'width' => 512,
           'height' => 341,
           'mime_type' => 'image/jpeg'
       ]
   ];
   ```

3. **Use image URLs when possible** (faster than base64)
   ```php
   $request_body = [
       'image' => [
           'url' => 'https://example.com/image.jpg'
       ]
   ];
   ```

4. **Cache results in WordPress** (don't regenerate alt text)
   ```php
   // Store in post meta
   update_post_meta($attachment_id, '_alt_text_generated', $alt_text);
   ```

## Production vs Development

| Feature | Development (SKIP_QUOTA_CHECK) | Production |
|---------|-------------------------------|------------|
| Quota checking | ❌ Disabled | ✅ Enabled |
| License validation | ❌ Skipped | ✅ Validated |
| Database queries | ❌ None | ✅ 3+ per request |
| Quota caching | ❌ Not needed | ✅ 1-minute TTL |
| Response time | ~2-5s | ~2.2-5.5s |
| Auth required | ❌ No | ✅ Yes |
| Billing | ❌ No tracking | ✅ Full tracking |

## Recommendations

**For local plugin development:**
- ✅ Use `SKIP_QUOTA_CHECK=true`
- ✅ Resize images to 512px
- ✅ Include dimensions in requests
- ✅ Use URLs instead of base64 when possible

**For production testing:**
- ✅ Use normal mode (no SKIP_QUOTA_CHECK)
- ✅ Set up Supabase env vars
- ✅ Enable quota caching (automatic)
- ✅ Monitor logs for performance

**For deployment:**
- ✅ Remove SKIP_QUOTA_CHECK
- ✅ Set all required env vars
- ✅ Enable quota caching
- ✅ Monitor with APM tools
