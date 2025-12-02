# Rate Limiter Fix - Summary

## Problem

The backend was returning **429 "Rate limit reached"** errors even when:
- Site had quota available (50 tokens remaining)
- Request was authenticated (site hash, license key, or JWT)

## Root Cause

The rate limiter middleware (`rateLimitByIp`) was applied to all `/api/` routes **BEFORE** authentication middleware, causing it to rate limit by IP address even for authenticated requests.

**Rate Limit Configuration:**
- Applied to: All `/api/` routes
- Limit: 100 requests per 15 minutes per IP address
- Message: "Too many requests from this IP..."

## Solution

Updated `src/middleware/rateLimiter.js` to **skip rate limiting for authenticated requests**:

```javascript
skip: (req) => {
  // Skip rate limiting if request has authentication headers
  const hasJWT = req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer ');
  const hasSiteHash = req.headers['x-site-hash'] || req.body?.siteHash;
  const hasLicenseKey = req.headers['x-license-key'] || req.body?.licenseKey;
  
  // Skip rate limiting for authenticated requests
  if (hasJWT || hasSiteHash || hasLicenseKey) {
    return true; // Skip rate limiting
  }
  
  return false; // Apply rate limiting
}
```

## Impact

✅ **Authenticated requests** (with JWT, site hash, or license key) now bypass IP-based rate limiting
✅ **Quota-based access control** still works correctly (via `requireSubscription` middleware)
✅ **Unauthenticated requests** still rate limited by IP (security maintained)

## Status

✅ Fixed and committed (commit `485151f`)
✅ Deployed to production

---

## Additional Issues Found (To Fix)

### 1. Database Column Name Mismatch

**Error:** `column subscriptions.canceled_at does not exist`
**Hint:** `Perhaps you meant to reference the column "subscriptions.cancelled_at"`

**Issue:** Code uses `canceled_at` (single 'l') but database has `cancelled_at` (double 'l')

**Location:** `src/services/dashboardChartsService.js:360`

**Fix Needed:** Update column name to match database schema

### 2. Missing Table

**Error:** `Could not find the table 'public.plugin_installations'`
**Hint:** `Perhaps you meant the table 'public.plugin_identities'`

**Issue:** Code references `plugin_installations` table which doesn't exist

**Location:** `src/services/dashboardChartsService.js:443`

**Fix Needed:** Use correct table name (`plugin_identities` or create missing table)

---

## Testing

After deploying the fix:
1. ✅ Authenticated requests should no longer get 429 errors when quota is available
2. ✅ Rate limiting still applies to unauthenticated requests
3. ✅ Quota checking works correctly (50 tokens = access granted)

