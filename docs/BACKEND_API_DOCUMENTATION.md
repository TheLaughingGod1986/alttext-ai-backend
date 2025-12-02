# Backend API Documentation - Answers to Frontend Team Questions

## 1. License Key Recognition

### How License Keys Are Recognized

**Yes, license keys are recognized in `/api/generate`**, but with important caveats:

- **Location:** License key is checked in the `combinedAuth` middleware (line 311 in `src/middleware/dual-auth.js`)
- **Format Checked:** Both header AND body are checked:
  ```javascript
  const licenseKey = req.headers['x-license-key'] || req.body?.licenseKey;
  ```

### Expected Format

- **Format:** UUID format (e.g., `335af811-01f3-479e-ba72-04ddf43865ec`)
- **Database Column:** `license_key` in the `licenses` table
- **Both Accepted:** Yes, both `X-License-Key` header AND `licenseKey` body field are checked
- **Priority:** Header takes precedence over body

### Important Note

**However**, the `/api/generate` endpoint uses **site-based quota** by default. License keys are used for authentication but quota is tracked by `X-Site-Hash`, not by license key. The license key is primarily used to:
1. Authenticate the request
2. Link the license to a site (stored in `sites.license_key`)
3. Determine plan/limits for the site

---

## 2. Usage Check Discrepancy

### Why the Mismatch Exists

The `/usage` endpoint and `/api/generate` endpoint check usage **differently**:

#### `/usage` Endpoint (`routes/usage.js`)

1. **Checks `X-License-Key` header first** (lines 52-77)
   - If found, looks up license in `licenses` table
   - Uses license quota if available
   - Falls back to site-based quota if no license

2. **Returns site usage** (`siteService.getSiteUsage()`)
   - Shows `remaining: 50` for site hash `f7d4e04305d8b16f7c673ec7dff713ce`

#### `/api/generate` Endpoint (`server-v2.js`)

1. **Uses `combinedAuth` middleware** which:
   - Tries JWT/license key authentication first
   - Then sets up site hash for quota tracking via `authenticateBySiteHashForQuota`

2. **Uses `requireSubscription` middleware** which:
   - **Prioritizes site-based quota** (`req.siteUsage.remaining > 0`)
   - Only checks user subscription if site quota is not available

3. **Recent fix:** Removed redundant quota check that was causing 429 errors

### The Issue

The 429 "Monthly limit reached" error was caused by:
- A redundant quota check in the handler (now removed in commit `931ae36`)
- The handler was calling `checkSiteQuota()` again after `requireSubscription` already validated access
- This created a race condition or stale data issue

**Fix Applied:**
- Removed redundant `checkSiteQuota()` call
- Now uses `req.siteUsage` already validated by middleware
- All quota checks are consistent

### Sync Delay

**No sync delay exists** - both endpoints query the same database. The issue was:
1. Redundant quota checking (now fixed)
2. Different code paths between endpoints (both valid, but confusing)

---

## 3. Request Headers/Body

### For License-Based Authentication

**Required Headers/Body:**

1. **X-Site-Hash** (REQUIRED)
   - Used for quota tracking
   - All users on the same site share quota

2. **X-License-Key** (Optional, but recommended)
   - Header format: `X-License-Key: 335af811-01f3-479e-ba72-04ddf43865ec`
   - OR body format: `{ "licenseKey": "335af811-01f3-479e-ba72-04ddf43865ec" }`

3. **Authorization** (Optional)
   - JWT token: `Bearer <token>`
   - Used if you want user-level authentication

### Recommended Request Structure

```javascript
// Headers
{
  "X-Site-Hash": "f7d4e04305d8b16f7c673ec7dff713ce",
  "X-License-Key": "335af811-01f3-479e-ba72-04ddf43865ec",
  "X-Site-URL": "http://localhost:8080"  // Optional
}

// Body
{
  "licenseKey": "335af811-01f3-479e-ba72-04ddf43865ec",  // Optional, if not in header
  "image_data": { ... },
  "service": "alttext-ai"
}
```

### Minimum Required

For free tier sites:
- **Only `X-Site-Hash` is required** - the site will use site-based quota (50 tokens/month)
- License key is optional but helps link the site to a license

---

## 4. Error Response Details

### When `/api/generate` Returns 429

**Current behavior (after fix):**

The endpoint should NOT return 429 for quota issues anymore. Instead:

- **403 Forbidden** is returned for access denied
- **429** is only returned for OpenAI API rate limiting

### Error Response Structure (403)

```json
{
  "ok": false,
  "code": "NO_ACCESS",
  "reason": "no_credits",  // or "no_subscription", "subscription_inactive", "plan_limit"
  "message": "No credits remaining for this site. Please upgrade or wait for monthly reset."
}
```

### Error Response Structure (429 - OpenAI Rate Limit)

```json
{
  "ok": false,
  "code": "OPENAI_RATE_LIMIT",
  "reason": "rate_limit_exceeded",
  "message": "OpenAI rate limit reached. Please try again later."
}
```

### Usage Information in Response

**No usage information is included in 403/429 error responses currently.**

The `/usage` endpoint should be called separately to get current quota status.

---

## 5. Site Hash vs License Key

### For Free Plan Users

**Authentication Flow:**

1. **Site Hash Only** ✅
   - Free tier sites can work with just `X-Site-Hash`
   - Quota is tracked per site (50 tokens/month)

2. **License Key Only** ❌
   - License key alone is not sufficient
   - Must include `X-Site-Hash` for quota tracking

3. **Both** ✅✅ (Recommended)
   - License key links site to license
   - Site hash tracks quota
   - Best for license-based sites

### Site-License Association

**Yes, the site hash `f7d4e04305d8b16f7c673ec7dff713ce` is correctly associated with license key `335af811-01f3-479e-ba72-04ddf43865ec`**

- Association is stored in `sites.license_key` column
- Can be set via `/api/licenses/auto-attach` endpoint
- Can be checked via `/usage` endpoint

### How to Check Association

```bash
# Check via usage endpoint
curl -H "X-Site-Hash: f7d4e04305d8b16f7c673ec7dff713ce" \
     -H "X-License-Key: 335af811-01f3-479e-ba72-04ddf43865ec" \
     https://your-api.com/api/usage
```

---

## 6. Specific Request Debugging

### Request Structure to Check

For the failing request:

```
POST /api/generate
Headers:
  X-Site-Hash: f7d4e04305d8b16f7c673ec7dff713ce
  X-License-Key: 335af811-01f3-479e-ba72-04ddf43865ec
  Content-Type: application/json
Body:
  {
    "licenseKey": "335af811-01f3-479e-ba72-04ddf43865ec",  // Optional
    "image_data": { ... },
    "service": "alttext-ai"
  }
```

### Expected Behavior (After Fix)

1. `combinedAuth` middleware:
   - Reads license key from header or body
   - Sets up site hash authentication
   - Sets `req.site` and `req.siteUsage`

2. `requireSubscription` middleware:
   - Checks `req.siteUsage.remaining > 0`
   - Should find 50 tokens remaining
   - **Allows access** ✅

3. Handler:
   - Uses `req.siteUsage` (no redundant check)
   - Proceeds with generation
   - Deducts 1 token after successful generation

### Why 429 Was Happening (Before Fix)

1. `requireSubscription` validated access ✅
2. Handler called `checkSiteQuota()` again ❌
3. Redundant check returned stale/incorrect data
4. Handler rejected request with 429 ❌

**This is now fixed.**

---

## 7. Backend Logs Structure

### Logs to Check For

When debugging, check these log entries:

#### 1. Authentication Logs

```
[CombinedAuth] License key check: 335af811-01f3-479e-ba72-04ddf43865ec
[CombinedAuth] Site hash: f7d4e04305d8b16f7c673ec7dff713ce
[CombinedAuth] Site authenticated successfully
```

#### 2. Subscription Check Logs

```
[RequireSubscription] Site-based auth: {
  siteHash: 'f7d4e04305d8b16f7c673ec7dff713ce',
  remaining: 50,
  limit: 50,
  hasQuota: true,
  hasEmail: false
}
```

#### 3. Generation Logs

```
[Generate] Request received
[Generate] Site Hash: f7d4e04305d8b16f7c673ec7dff713ce
[Generate] License Key: 335af811-01f3-479e-ba72-04ddf43865ec
[Generate] Service: alttext-ai
```

#### 4. Error Logs (if any)

```
[RequireSubscription] Missing site info: { ... }
[SiteService] Error in checkSiteQuota: { ... }
```

### What to Share (Sanitized)

If requesting logs from backend team, ask for:

1. **Request Headers:**
   ```
   X-Site-Hash: f7d4e04305d8b16f7c673ec7dff713ce
   X-License-Key: 335af811-01f3-479e-ba72-04ddf43865ec
   Authorization: Bearer <token> (if present)
   ```

2. **Request Body (sanitized):**
   ```json
   {
     "licenseKey": "335af811-01f3-479e-ba72-04ddf43865ec",
     "service": "alttext-ai",
     "image_data": { ... }
   }
   ```

3. **Site Usage Check Result:**
   ```json
   {
     "used": 0,
     "remaining": 50,
     "limit": 50,
     "plan": "free"
   }
   ```

4. **Error Response (if 429/403):**
   ```json
   {
     "ok": false,
     "code": "...",
     "reason": "...",
     "message": "..."
   }
   ```

---

## Summary & Recommendations

### Current Status

✅ **Fixed Issues:**
- Removed redundant quota check causing 429 errors
- Site-based quota now works correctly
- Free tier sites can use site hash only

⚠️ **Things to Note:**
- License keys are recognized but quota is site-based
- `/usage` and `/api/generate` check quota differently (both valid)
- `X-Site-Hash` is required, license key is optional

### Recommendations for Frontend

1. **Always send `X-Site-Hash` header** (required)
2. **Optionally send `X-License-Key` header** (helps link site to license)
3. **Check `/usage` endpoint** before calling `/api/generate` to show quota
4. **Handle 403 errors** (not 429) for quota exhaustion
5. **Show usage info from `/usage` response** in UI

### Testing Checklist

- [ ] Send request with only `X-Site-Hash` → Should work (free tier)
- [ ] Send request with `X-Site-Hash` + `X-License-Key` → Should work
- [ ] Check `/usage` shows 50 remaining → Should match site quota
- [ ] Call `/api/generate` → Should succeed (not 429)
- [ ] Check logs for `[RequireSubscription] Site-based auth` → Should show `hasQuota: true`

---

## Contact & Support

If issues persist after the fix:

1. Check backend logs for the specific request
2. Verify site hash exists in database
3. Verify license key exists and is linked to site
4. Confirm `req.siteUsage.remaining > 0` in logs
5. Share sanitized logs with backend team

The redundant quota check has been removed, so this should resolve the 429 errors.

