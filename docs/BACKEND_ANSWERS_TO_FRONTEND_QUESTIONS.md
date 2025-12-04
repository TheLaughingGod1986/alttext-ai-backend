# Backend Answers to Frontend Questions

This document provides comprehensive answers to all questions from the frontend team regarding API endpoints, data formats, authentication, and configuration.

**Date:** 2025-01-15  
**Status:** All critical questions answered ✅

---

## 🔴 Critical Questions (All Answered)

### 1. Billing Portal Endpoint Path ✅

**Question:** Which endpoint should the frontend use for creating Stripe billing portal sessions?

**Answer:** Use `POST /billing/create-portal` (confirmed correct endpoint)

**Current Backend Status:**
- ✅ `POST /billing/create-portal` - **CORRECT ENDPOINT** (exists in `src/routes/billing.js:151`)
- ❌ `/billing/create-portal-session` - Does NOT exist
- ❌ `/me/stripe-portal` - Does NOT exist

**Action Required:**
- **Frontend:** Update all references to use `/billing/create-portal`
- **Files to update:**
  - `lib/api-client.ts` - Change `/billing/create-portal-session` → `/billing/create-portal`
  - `hooks/useStripePortal.ts` - Change `/me/stripe-portal` → `/billing/create-portal`

**Request Format:**
```typescript
POST /billing/create-portal
Headers:
  Authorization: Bearer <token>
  Content-Type: application/json

Request Body: (optional - email from token is used)
{
  "email": "user@example.com" // Optional, uses token email
}

Response:
{
  "ok": true,
  "url": "https://billing.stripe.com/session/..." // Portal URL
}
```

---

### 2. License Activation Endpoint ✅

**Question:** Confirmed `/api/license/activate` (singular) is correct?

**Answer:** ✅ **YES - Confirmed correct**

- **Route:** `POST /api/license/activate` (singular, NOT plural)
- **File:** `routes/license.js:36`
- **Status:** No action needed - frontend is correct

---

## ⚠️ Important Clarifications (All Answered)

### 3. Dashboard Charts Data Structure ✅

**Question:** What is the expected response format for `/dashboard/charts`?

**Answer:** ✅ **Frontend expectation is CORRECT**

**Response Format:**
```typescript
{
  ok: boolean;
  charts: {
    dailyUsage: Array<{ date: string; images: number; tokens: number }>;
    monthlyUsage: Array<{ month: string; images: number; tokens: number }>;
    creditTrend: Array<{ date: string; creditsRemaining: number; plan: string | null }>;
    subscriptionHistory: Array<{ date: string; plan: string; event: string }>;
    installActivity: Array<{ date: string; plugin: string; installs: number }>;
    usageHeatmap: Array<{ weekday: number; hour: number; events: number }>;
    eventSummary: Array<{ eventType: string; count: number }>;
  };
  subscriptionStatus?: 'none' | 'active' | 'inactive' | 'expired';
  quotaRemaining?: number;
  quotaUsed?: number;
}
```

**Key Points:**
- ✅ All chart arrays are **always present** (can be empty `[]`) - no null checks needed
- ✅ Response always returns HTTP `200` (even on errors)
- ✅ On error: `ok: false` with empty chart arrays
- ✅ Missing data returns empty arrays (never null/undefined)

**Backend Implementation:**
- **File:** `src/routes/dashboardCharts.js:174`
- **Service:** `src/services/dashboardChartsService.js`

---

### 4. Dashboard Endpoint Response Format ✅

**Question:** What is the exact structure of `/dashboard` endpoint response?

**Answer:** ✅ **Format confirmed**

**Response Format:**
```typescript
{
  ok: boolean; // ✅ Always present
  installations: Installation[]; // ✅ Always array (can be empty)
  subscription: DashboardSubscription | SubscriptionInfo | null; // Can be null
  usage: {
    monthlyImages: number;
    dailyImages: number;
    weeklyImages: number;
    // ... other usage fields
  };
  credits?: {
    balance: number;
    recentPurchases: Array<{
      id: string;
      amount: number;
      created_at: string;
      balance_after: number;
      transaction_type: string;
    }>;
  };
  subscriptionStatus?: 'none' | 'active' | 'inactive' | 'expired';
  quotaRemaining?: number;
  quotaUsed?: number;
  recentEvents?: Array<{
    id: string;
    event_type: string;
    created_at: string;
    credits_delta: number;
    metadata: object;
  }>;
}
```

**Key Points:**
- ✅ `ok: true` field is **always present**
- ✅ `usage` object structure matches frontend expectations
- ✅ `subscription` can be `null` (for free-tier users)
- ✅ `credits` is optional (only present if user has credits)
- ✅ Response is **cached for 45 seconds** to reduce database load
- ✅ Always returns HTTP `200` (never throws 500 on data errors)

**Backend Implementation:**
- **File:** `src/routes/dashboard.js:127`
- **Service:** `src/services/identityService.js` (getIdentityDashboard)

---

### 5. Error Response Format ✅

**Question:** What is the standard error response format?

**Answer:** ✅ **Frontend expectation is CORRECT**

**Standard Error Format:**
```json
{
  "ok": false,
  "code": "NO_ACCESS" | "NOT_FOUND" | "OPENAI_RATE_LIMIT" | "VALIDATION_ERROR" | "SERVER_ERROR",
  "reason": "no_credits" | "no_subscription" | "rate_limit_exceeded" | "validation_failed" | "server_error",
  "message": "Human-readable error message",
  "error": "Alternative error field (some endpoints use this)",
  "errors": { /* Optional field-level validation errors */ }
}
```

**Error Codes:**
- `NO_ACCESS` - Access denied (no subscription, no credits, etc.)
- `NOT_FOUND` - Resource not found
- `OPENAI_RATE_LIMIT` - OpenAI API rate limit exceeded
- `VALIDATION_ERROR` - Request validation failed
- `SERVER_ERROR` - Internal server error
- `MISSING_TOKEN` - Authentication token missing
- `INVALID_TOKEN` - Authentication token invalid

**Reasons:**
- `no_subscription` - No active subscription
- `subscription_inactive` - Subscription exists but inactive
- `no_credits` - No credits remaining
- `plan_limit` - Plan limit exceeded
- `no_identity` - User identity not found
- `rate_limit_exceeded` - Rate limit hit
- `validation_failed` - Request validation failed
- `server_error` - Internal server error

**Documentation:**
- **File:** `src/constants/errorCodes.js`
- **Usage:** Used consistently across all middleware and routes

---

## 🔧 Configuration Questions (All Answered)

### 6. Authentication Token Format ✅

**Question:** What is the expected JWT token format?

**Answer:** ✅ **Bearer token format is CORRECT**

**Token Format:**
- ✅ **Header:** `Authorization: Bearer <token>`
- ✅ **Expiration:** 7 days (configurable via `JWT_EXPIRES_IN` env var)
- ✅ **Default:** `JWT_EXPIRES_IN=7d`
- ✅ **Stored in:** Cookie (`optti_token`) or localStorage - both supported

**Token Payload:**
```json
{
  "id": "user_id",
  "identityId": "identity_id",
  "email": "user@example.com",
  "plan": "free" | "pro" | "agency",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Token Refresh:**
- ❌ **Automatic refresh:** Not currently implemented
- ✅ **Manual refresh:** Users must re-authenticate after token expires
- ✅ **Refresh token:** Available but not yet used for automatic refresh

**Backend Implementation:**
- **File:** `auth/jwt.js`
- **Secret:** `JWT_SECRET` environment variable
- **Expiration:** `JWT_EXPIRES_IN` environment variable (default: `7d`)

---

### 7. Site Hash and License Key Headers ✅

**Question:** For plugin API calls, what headers are required vs optional?

**Answer:** ✅ **Current understanding is CORRECT**

**Headers:**
- ✅ `X-Site-Hash`: **REQUIRED** for quota tracking (all requests)
- ✅ `X-License-Key`: **Optional** (links site to license for paid plans)
- ✅ `X-Site-URL`: **Optional** (for reference, helps identify site)
- ✅ `X-Site-Fingerprint`: **Optional** (for abuse prevention)

**What happens if headers are missing:**

| Header | Missing Behavior |
|--------|------------------|
| `X-Site-Hash` | ❌ Returns `400 Bad Request` with `MISSING_SITE_HASH` error |
| `X-License-Key` | ✅ Site uses free-tier quota (50 tokens/month) |
| `X-Site-URL` | ✅ Works fine, site URL is optional |

**Can `X-License-Key` be in body?**
- ✅ **YES** - Can be in request body as `licenseKey` field
- ✅ Backend checks both header and body: `req.headers['x-license-key'] || req.body?.licenseKey`

**Backend Implementation:**
- **File:** `routes/usage.js:20` - Validates `X-Site-Hash` requirement
- **File:** `src/middleware/dual-auth.js` - Handles license key from header or body

---

### 8. Quota and Usage Tracking ✅

**Question:** How is quota tracked and reset?

**Answer:** ✅ **Quota tracking details**

**Free Tier:**
- ✅ **Limit:** 50 tokens/month per site (tracked by `X-Site-Hash`)
- ✅ **Reset:** Monthly on the **1st of each month** at 00:00 UTC
- ✅ **Tracking:** Site-based (all users on same site share quota)
- ✅ **Reset Logic:** Automatic - checked on every usage request

**Reset Behavior:**
```typescript
// Reset occurs automatically when:
// 1. Current date > reset_date
// 2. On next usage check after reset_date passes
// 3. Reset date is set to: First day of next month (YYYY-MM-01)
```

**Token Consumption:**
- ✅ **1 generation = ~100 tokens** (approximate)
- ✅ Actual token count varies by image complexity
- ✅ Tokens are consumed from quota on successful generation

**Can users see when quota resets?**
- ✅ **YES** - Available in `/usage` endpoint response:
  ```json
  {
    "resetDate": "2025-02-01",
    "reset_timestamp": 1706745600
  }
  ```

**Backend Implementation:**
- **File:** `src/services/siteService.js:113` - `getSiteUsage()` handles automatic reset
- **Reset Date:** Calculated as first day of next month: `new Date(now.getFullYear(), now.getMonth() + 1, 1)`

---

## 🐛 Bug Fixes Needed (All Fixed)

### 9. Dashboard Charts - Column Name ✅ FIXED

**Issue:** Column name mismatch in `dashboardChartsService.js:360`

**Status:** ✅ **FIXED**

- ✅ Changed `canceled_at` → `cancelled_at` (British spelling)
- ✅ Updated in `src/services/dashboardChartsService.js:360` and `:412`
- ✅ All tests updated

---

### 10. Dashboard Charts - Missing Table ✅ FIXED

**Issue:** Missing `plugin_installations` table in `dashboardChartsService.js:443`

**Status:** ✅ **FIXED**

- ✅ Changed `plugin_installations` → `plugin_identities`
- ✅ Updated in `src/services/dashboardChartsService.js:443` and `:604`
- ✅ Mapped `updated_at` → `last_seen_at` for API compatibility
- ✅ All tests updated

---

## 📊 Data Format Questions (All Answered)

### 11. Date/Time Formats ✅

**Question:** What date/time format should we expect?

**Answer:** ✅ **ISO 8601 format is standard**

**Date Formats:**
- ✅ **Dates:** ISO 8601 strings - `"2024-01-15T10:30:00Z"` or `"2024-01-15"`
- ✅ **Date-only:** `"YYYY-MM-DD"` format (e.g., `"2024-01-15"`)
- ✅ **Timestamps:** Unix timestamps in **seconds** (not milliseconds)
- ✅ **Timezone:** UTC (all dates in UTC)

**Examples:**
```json
{
  "created_at": "2024-01-15T10:30:00Z",  // ISO 8601 with time
  "reset_date": "2024-02-01",            // ISO 8601 date-only
  "reset_timestamp": 1706745600          // Unix seconds
}
```

**Backend Standard:**
- All dates stored in UTC
- All dates returned as ISO 8601 strings
- Timestamps in seconds (Unix epoch)

---

### 12. Currency and Pricing ✅

**Question:** What currency format is used?

**Answer:** ✅ **Amounts in cents, currency codes supported**

**Currency Format:**
- ✅ **Amounts:** Stored in **cents** (e.g., `1299` = £12.99)
- ✅ **Currency Codes:** Supported via Stripe (GBP, USD, EUR, etc.)
- ✅ **Default Currency:** Determined by Stripe account settings

**Example:**
```json
{
  "amount": 1299,        // £12.99 in cents
  "currency": "GBP",     // Currency code
  "formatted": "£12.99"  // Frontend should format for display
}
```

**Stripe Integration:**
- All prices in cents (Stripe standard)
- Currency determined by Stripe customer locale
- Prices displayed in user's currency

**Frontend Display:**
- Convert cents to major units: `amount / 100`
- Format with currency symbol: `new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount / 100)`

---

## 🔐 Security Questions (All Answered)

### 13. CORS Configuration ✅

**Question:** Are CORS headers properly configured?

**Answer:** ✅ **CORS is properly configured**

**Allowed Origins:**
```javascript
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.FRONTEND_DASHBOARD_URL,
  'https://oppti.dev',
  'https://app.optti.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173', // Vite default
  'http://localhost:5174', // Vite alternate
];
```

**CORS Settings:**
- ✅ **Credentials:** Enabled (`credentials: true`)
- ✅ **Methods:** `GET, POST, PUT, DELETE, PATCH, OPTIONS`
- ✅ **Development:** All origins allowed in `NODE_ENV=development`
- ✅ **Production:** Only allowed origins accepted

**Configuration:**
- **File:** `server-v2.js:475`
- **Status:** ✅ `oppti.dev` is in allowed origins list

**Action Required:**
- ✅ **No action needed** - `oppti.dev` is already configured
- If using `credentials: include`, ensure cookies are properly set

---

### 14. Rate Limiting ✅

**Question:** After the rate limiter fix, what are the limits?

**Answer:** ✅ **Rate limits confirmed**

**Rate Limits:**

| Request Type | Limit | Window | Notes |
|-------------|-------|--------|-------|
| **Unauthenticated** | 100 requests | 15 minutes | By IP address |
| **Authenticated** | **Unlimited** | N/A | Bypasses IP rate limiting |
| **Billing Endpoints** | 10 requests | 15 minutes | Stricter limit |

**Authentication Bypass:**
- ✅ Authenticated requests (JWT, site hash, or license key) **skip IP rate limiting**
- ✅ Headers checked: `Authorization`, `X-Site-Hash`, `X-License-Key`
- ✅ Body fields checked: `siteHash`, `licenseKey`

**Rate Limit Headers:**
- ✅ Standard headers: `RateLimit-*` (RFC 6585)
- ✅ Legacy headers: Disabled

**Configuration:**
- **File:** `src/middleware/rateLimiter.js:42`
- **Default:** 100 requests per 15 minutes (IP-based)
- **Sensitive endpoints:** 10 requests per 15 minutes (billing, etc.)

**Frontend Handling:**
- ✅ Show rate limit info to users (via response headers)
- ✅ Retry with exponential backoff when rate limited
- ✅ Display user-friendly error: "Too many requests. Please try again later."

---

## 🧪 Testing Questions (Answered)

### 15. Test Data ✅

**Question:** How can we test the frontend with backend?

**Answer:** ✅ **Testing information**

**Test Environments:**
- ✅ **Staging:** Available (check with backend team for URL)
- ✅ **Development:** `http://localhost:PORT` (configured in `.env`)

**Test Credentials:**
- ✅ Contact backend team for test user accounts
- ✅ Test license keys available for development

**Test License Keys:**
- Contact backend team for test license keys
- Free-tier sites work without license keys (50 tokens/month)

**Testing Quota Exhaustion:**
1. Create a test site with `X-Site-Hash: test-exhausted-site`
2. Use all 50 tokens
3. Next request should return `403` with `NO_ACCESS` / `no_credits`

**Backend Test Data:**
- Test users can be created via registration endpoint
- Test sites can be created by using `X-Site-Hash` header

---

### 16. Error Scenarios ✅

**Question:** How should we test error scenarios?

**Answer:** ✅ **Error testing guide**

**Triggering Errors:**

| Error | How to Trigger |
|-------|---------------|
| **403 (Quota Exhausted)** | Use all tokens for a site, then make generation request |
| **429 (Rate Limited)** | Make 100+ unauthenticated requests in 15 minutes |
| **404 (Not Found)** | Request non-existent endpoint or resource |
| **401 (Unauthorized)** | Make request without authentication token |
| **400 (Validation Error)** | Send invalid request body or missing required fields |

**Test Endpoints:**
- ❌ No dedicated test endpoints for error scenarios
- ✅ Use actual endpoints with invalid data/headers

**Error Testing Checklist:**
1. ✅ Test quota exhaustion (`403`)
2. ✅ Test rate limiting (`429`)
3. ✅ Test missing authentication (`401`)
4. ✅ Test invalid requests (`400`)
5. ✅ Test not found resources (`404`)

---

## 📝 Documentation Questions (Answered)

### 17. API Documentation ✅

**Question:** Is there complete API documentation?

**Answer:** ✅ **Yes, documentation exists**

**Documentation Location:**
- ✅ **Main API Docs:** `docs/BACKEND_API_DOCUMENTATION.md`
- ✅ **Endpoint Verification:** `docs/API_ENDPOINTS_VERIFICATION.md`
- ✅ **Dashboard:** `docs/dashboard.md`
- ✅ **Subscriptions:** `docs/subscriptions.md`
- ✅ **Credits:** `docs/credits.md`
- ✅ **Identity Sync:** `docs/identity-sync.md`
- ✅ **Access Control:** `docs/access-control.md`

**Documentation Coverage:**
- ✅ All endpoints documented
- ✅ Request/response formats documented
- ✅ Error codes documented
- ✅ Authentication requirements documented

**Latest Documentation:**
- ✅ All endpoints verified and documented (see `API_ENDPOINTS_VERIFICATION.md`)
- ✅ Response formats documented
- ✅ Error codes standardized

---

### 18. Changelog/Versioning ✅

**Question:** How are API changes communicated?

**Answer:** ✅ **Versioning strategy**

**Current Status:**
- ✅ **Version:** `2.0.0` (monetization phase)
- ✅ **Changelog:** Check git commits for changes
- ❌ **Formal changelog:** Not yet implemented
- ✅ **Breaking changes:** Communicated via git commits and documentation updates

**API Versioning:**
- ✅ **No version prefix:** All endpoints are current version
- ✅ **Backward compatibility:** Maintained where possible
- ✅ **Breaking changes:** Communicated in commit messages

**Recommendation:**
- Consider adding `CHANGELOG.md` for formal change tracking
- Consider API versioning (`/v2/api/...`) for future breaking changes

---

## ✅ Priority Summary

### High Priority (All Answered) ✅

1. ✅ **Billing portal endpoint path** - Use `/billing/create-portal`
2. ✅ **Dashboard endpoint response format** - Format confirmed
3. ✅ **Error response format** - Standard format confirmed
4. ✅ **Authentication token format** - Bearer token confirmed

### Medium Priority (All Answered) ✅

5. ✅ **Dashboard charts data structure** - Format confirmed
6. ✅ **Quota tracking and reset behavior** - Monthly reset on 1st confirmed
7. ✅ **Date/time formats** - ISO 8601 confirmed
8. ✅ **CORS configuration** - Properly configured

### Low Priority (All Answered) ✅

9. ✅ **Test data and credentials** - Contact backend team
10. ✅ **API documentation location** - All docs in `docs/` folder
11. ✅ **Changelog/versioning strategy** - Version 2.0.0, check git commits

---

## 🎯 Action Items for Frontend Team

### Immediate Actions Required:

1. **Update Billing Portal Endpoint:**
   - Change `/billing/create-portal-session` → `/billing/create-portal`
   - Change `/me/stripe-portal` → `/billing/create-portal`
   - Files: `lib/api-client.ts`, `hooks/useStripePortal.ts`

2. **Verify Error Handling:**
   - Ensure all error codes are handled (`NO_ACCESS`, `NOT_FOUND`, etc.)
   - Display user-friendly error messages

3. **Update Rate Limit Handling:**
   - Show rate limit info to users when `429` occurs
   - Implement exponential backoff for retries

### Recommended Updates:

1. **Add Quota Reset Display:**
   - Show users when their quota will reset (use `resetDate` from `/usage`)
   - Display countdown to next reset

2. **Currency Formatting:**
   - Format prices correctly (cents → major units)
   - Use `Intl.NumberFormat` for proper currency display

3. **Date Formatting:**
   - All dates in ISO 8601 format
   - Timestamps in seconds (not milliseconds)

---

## 📞 Contact

**Backend Team:**
- All questions answered in this document
- Additional questions: Create issue in repository
- Test credentials: Contact backend team directly

**Status:** ✅ **All questions answered and documented**

---

## 🔄 Document History

- **2025-01-15:** Initial comprehensive answers to all frontend questions
- All critical questions answered
- All endpoints verified
- All configurations documented

