# Fresh-Stack v2.0 Implementation Plan

**Status:** Ready to Implement
**Estimated Timeline:** 3-4 weeks
**Approach:** Test-Driven Development (TDD)

---

## What We've Designed

Based on your requirements and the plugin team's feedback, I've created:

1. **[API_SPEC.md](./API_SPEC.md)** - Complete API specification with:
   - ✅ Standardized field names (no more ambiguity)
   - ✅ Proper error codes and HTTP statuses
   - ✅ Multi-user tracking (`X-WP-User-ID`, `X-WP-User-Email` headers)
   - ✅ Multi-site support (agency plans)
   - ✅ Per-site quota limits (agency)
   - ✅ Batch processing endpoints
   - ✅ License management (validate, activate, deactivate)
   - ✅ Always returns `reset_date` (never null)

2. **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** - PostgreSQL schema with:
   - ✅ Simple license-based auth (no complex organizations/JWT)
   - ✅ User tracking in usage logs
   - ✅ Per-site quota limits (agency only)
   - ✅ Billing anchor dates (custom reset dates)
   - ✅ One-time credit purchases
   - ✅ Pre-aggregated quota summaries (fast lookups)
   - ✅ Debug logs (visible in dashboard)

---

## Architecture Overview

```
fresh-stack/
├── config/
│   ├── plans.js              # Plan definitions (free: 50, pro: 1000, agency: 10000)
│   └── env.js                # Environment config loader
│
├── lib/
│   ├── openai.js             ✅ Already exists
│   ├── redis.js              ✅ Already exists
│   ├── validation.js         ✅ Already exists
│   ├── queue.js              ✅ Already exists
│   └── stripe.js             ➕ NEW - Stripe client wrapper
│
├── middleware/
│   ├── auth.js               ➕ NEW - License key auth
│   ├── rateLimit.js          ➕ NEW - Extract from server.js
│   └── errorHandler.js       ➕ NEW - Standardized error responses
│
├── services/
│   ├── license.js            ➕ NEW - License CRUD + validation
│   ├── quota.js              ➕ NEW - Quota checking + enforcement
│   ├── usage.js              ➕ NEW - Usage tracking + reporting
│   ├── site.js               ➕ NEW - Site management
│   └── billing.js            🔄 UPDATE - Add subscription webhooks
│
├── routes/
│   ├── altText.js            🔄 UPDATE - Add user tracking headers
│   ├── usage.js              🔄 UPDATE - Add per-user/site breakdowns
│   ├── billing.js            ✅ Keep as-is (mostly)
│   ├── license.js            ➕ NEW - License endpoints
│   └── dashboard.js          ➕ NEW - Dashboard stats API
│
├── tests/
│   ├── unit/                 ➕ NEW - Unit tests (TDD)
│   ├── integration/          ➕ NEW - Integration tests
│   └── e2e/                  ➕ NEW - End-to-end tests
│
├── API_SPEC.md              ✅ Done
├── DATABASE_SCHEMA.md       ✅ Done
└── IMPLEMENTATION_PLAN.md   ✅ You're reading it
```

---

## Key Design Decisions

### 1. License-Based Authentication (Not JWT)

**Old (server-v2.js):**
- User registers → JWT token
- User creates organization
- User invites members
- Complex JWT + org membership checks

**New (fresh-stack v2.0):**
- User registers → License key created
- Plugin uses license key in `X-License-Key` header
- All users on site share quota (no per-user auth)
- Dashboard login uses email/password (session tokens, not JWT)

**Why:** Simpler, faster, matches plugin usage pattern.

---

### 2. Multi-Site Support (Agency Plans)

**How it works:**
1. Agency license can activate on multiple sites
2. Each site gets unique `site_hash` (sent as `X-Site-Key`)
3. Agency owner can set per-site quota limits
4. Usage aggregated across all sites for billing
5. Dashboard shows per-site breakdown

**Database:**
```sql
licenses (license_key, plan_type='agency')
  └── sites (site_hash, quota_limit=3000)
      └── usage_logs (user_email, credits_used)
```

---

### 3. Quota System

**Plan Limits:**
- **Free:** 50 credits/month, 1 site, multiple users
- **Pro:** 1,000 credits/month, 1 site, multiple users
- **Agency:** 10,000 credits/month, unlimited sites, per-site limits

**Reset Dates:**
- Based on `billing_anchor_date` (not calendar month)
- Example: User signs up Jan 15 → resets Feb 15, Mar 15, etc.
- Always returned in API responses (never null/missing)

**Enforcement:**
- Checked before alt text generation
- Returns `402 Payment Required` when exhausted
- Shows `reset_date` so user knows when quota refills

---

### 4. User Tracking

Plugin sends these headers:
```http
X-WP-User-ID: 5
X-WP-User-Email: admin@example.com
X-Site-Key: abc123def456
X-License-Key: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Backend logs:
- `usage_logs` table: `license_key`, `site_hash`, `user_id`, `user_email`, `credits_used`, `created_at`

Dashboard shows:
- Who used credits (email)
- When they used them (timestamp)
- What images (image_url)
- How many credits (per image)

---

### 5. Standardized Field Names

**Plugin team's feedback addressed:**

❌ **Before:** Multiple field name variations
```php
$used = $usage['credits_used'] ?? $usage['used'] ?? 0;
$remaining = $usage['credits_remaining'] ?? $usage['remaining'] ?? 0;
$limit = $usage['total_limit'] ?? $usage['limit'] ?? 0;
```

✅ **After:** ONE set of field names (always consistent)
```json
{
  "credits_used": 234,
  "credits_remaining": 766,
  "total_limit": 1000,
  "plan_type": "pro",
  "reset_date": "2025-01-15T00:00:00Z"
}
```

**Plugin can now trust the backend** (no recalculations, no fallbacks).

---

## Implementation Phases

### Phase 1: Database Setup (Week 1, Days 1-2)

**Tasks:**
1. Create Supabase migration: `migrations/001_fresh_stack_v2.sql`
2. Define tables: `licenses`, `sites`, `usage_logs`, `quota_summaries`, `subscriptions`, `credits`, `debug_logs`, `dashboard_sessions`
3. Add triggers: `update_quota_summary()`, `update_updated_at()`
4. Create views: `v_license_quota_current`
5. Test migrations locally

**Tests:**
- [ ] All tables created without errors
- [ ] Indexes created successfully
- [ ] Triggers fire correctly
- [ ] Views return expected data

---

### Phase 2: Core Services (Week 1, Days 3-5)

**Tasks:**
1. **`services/license.js`** (TDD)
   - `createLicense(email, plan_type)`
   - `validateLicense(license_key)`
   - `activateLicense(license_key, site_id, site_url)`
   - `deactivateLicense(license_key, site_id)`
   - `getLicenseDetails(license_key)`

2. **`services/quota.js`** (TDD)
   - `getQuotaStatus(license_key, site_hash?)`
   - `checkQuotaAvailable(license_key, credits_needed)`
   - `calculateResetDate(billing_anchor_date)`
   - `enforceQuota(license_key, credits_needed)` → throws if exceeded

3. **`services/usage.js`** (TDD)
   - `recordUsage(license_key, site_hash, user_id, user_email, credits_used, metadata)`
   - `getUserUsage(license_key, site_hash, period_start, period_end)`
   - `getSiteUsage(license_key, period_start, period_end)` → per-site breakdown
   - `getUsageLogs(license_key, filters)` → detailed logs

4. **`services/site.js`** (TDD)
   - `createSite(license_key, site_hash, site_url, site_name)`
   - `getSites(license_key)`
   - `setSiteQuota(license_key, site_hash, quota_limit)` → agency only
   - `updateSiteActivity(site_hash)`

**Tests:**
- [ ] Unit tests for each service function
- [ ] Edge cases: expired licenses, max sites reached, quota exceeded
- [ ] Database constraints enforced (unique license_key, site_hash)

---

### Phase 3: Authentication Middleware (Week 2, Days 1-2)

**Tasks:**
1. **`middleware/auth.js`** (TDD)
   - `validateLicenseKey` - Checks `X-License-Key` header, validates license status
   - `validateApiToken` - Checks `X-API-Key` header (fallback auth)
   - `extractUserInfo` - Extracts `X-WP-User-ID` and `X-WP-User-Email` from headers
   - `attachLicenseToRequest` - Adds `req.license`, `req.site`, `req.user` objects

2. **`middleware/rateLimit.js`** (extract from server.js)
   - Move existing rate limiting logic
   - Add license-based limits (free: 60/min, pro: 120/min, agency: 240/min)

3. **`middleware/errorHandler.js`** (TDD)
   - Standardized error response format
   - Log errors to `debug_logs` table
   - Return proper HTTP status codes + error codes

**Tests:**
- [ ] Valid license key → success
- [ ] Invalid license key → 401 Unauthorized
- [ ] Expired license → 410 Gone
- [ ] Suspended license → 403 Forbidden
- [ ] Rate limit enforced correctly

---

### Phase 4: License Management Routes (Week 2, Days 3-5)

**Tasks:**
1. **`routes/license.js`** (TDD)
   - `POST /license/validate` - Validate license without activating
   - `POST /license/activate` - Activate license on site
   - `POST /license/deactivate` - Deactivate license from site
   - `GET /license/sites` - List all sites (agency)
   - `POST /license/sites/:site_id/quota` - Set per-site quota (agency)

**Tests:**
- [ ] Validate returns correct license details
- [ ] Activate creates site record
- [ ] Activate fails if max sites reached
- [ ] Activate fails if already activated (pro/free plans)
- [ ] Agency can activate on multiple sites
- [ ] Agency can set per-site quotas
- [ ] Deactivate removes site record

---

### Phase 5: Usage & Quota Routes (Week 3, Days 1-3)

**Tasks:**
1. **Update `routes/altText.js`**
   - Extract user info from headers (`X-WP-User-ID`, `X-WP-User-Email`)
   - Check quota before generation (using `quota.enforceQuota()`)
   - Record usage with user tracking (using `usage.recordUsage()`)
   - Return quota info in response

2. **Update `routes/usage.js`**
   - `GET /usage` - Current quota status
   - `GET /usage/users` - Per-user breakdown
   - `GET /usage/sites` - Per-site breakdown (agency)
   - Always return `reset_date` (never null)
   - Add rate_limit info to responses

**Tests:**
- [ ] Alt text generation records usage with user info
- [ ] Quota enforced (402 when exhausted)
- [ ] `/usage` returns standardized field names
- [ ] `/usage/users` shows per-user breakdown
- [ ] `/usage/sites` shows per-site breakdown (agency only)
- [ ] `reset_date` always present in responses

---

### Phase 6: Billing & Stripe Webhooks (Week 3, Days 4-5)

**Tasks:**
1. **Update `routes/billing.js`**
   - Add Stripe subscription webhook handler
   - Update license plan on subscription change
   - Update billing anchor date
   - Handle subscription cancellation
   - Add one-time credit purchase endpoint

2. **`services/billing.js`**
   - `handleSubscriptionCreated(stripe_event)`
   - `handleSubscriptionUpdated(stripe_event)`
   - `handleSubscriptionDeleted(stripe_event)`
   - `handlePaymentSucceeded(stripe_event)` → update billing anchor
   - `purchaseCredits(license_key, amount)` → create credits record

**Tests:**
- [ ] Webhook signature validation
- [ ] Subscription created → license plan updated
- [ ] Subscription canceled → license status updated
- [ ] Payment succeeded → billing anchor updated
- [ ] Credit purchase creates credits record

---

### Phase 7: Dashboard API (Week 4, Days 1-3)

**Tasks:**
1. **`routes/dashboard.js`** (TDD)
   - `POST /dashboard/login` - Email/password login → session token
   - `POST /dashboard/logout` - Invalidate session token
   - `GET /dashboard/stats` - Usage stats, costs, user breakdown
   - `GET /dashboard/sites` - Site management (agency)
   - `GET /dashboard/logs` - Debug logs
   - `GET /dashboard/usage/export` - CSV export of usage logs

2. **Session management**
   - Use `dashboard_sessions` table
   - Session tokens expire after 7 days
   - Refresh token on activity

**Tests:**
- [ ] Login with valid email/password → session token
- [ ] Login with invalid credentials → 401
- [ ] Session token validates correctly
- [ ] Session expires after 7 days
- [ ] Stats endpoint returns correct data
- [ ] Agency sees all sites in dashboard

---

### Phase 8: Testing & Documentation (Week 4, Days 4-5)

**Tasks:**
1. **Integration tests**
   - End-to-end flow: register → activate → generate → check usage
   - Agency flow: activate multiple sites → set quotas → usage breakdown
   - Quota enforcement: exhaust quota → 402 error → wait for reset
   - Billing flow: subscribe → webhook → plan updated

2. **Performance testing**
   - Load test with 1000 concurrent requests
   - Quota lookup performance (<10ms)
   - Usage recording performance (<50ms)

3. **Documentation**
   - Update README with setup instructions
   - Add API examples for common flows
   - Document migration from server-v2.js
   - Create plugin integration guide

4. **Code cleanup**
   - Remove all unused code from server-v2.js
   - Ensure all files <300 lines
   - Add JSDoc comments
   - Run linter and formatter

**Tests:**
- [ ] E2E tests pass
- [ ] Load tests meet performance targets
- [ ] No code duplication
- [ ] All functions documented
- [ ] Test coverage >80%

---

## Migration Strategy

### Option 1: Parallel Deployment (Zero Downtime)

1. Deploy fresh-stack v2.0 to new Render service
2. Update plugin to use new API endpoints
3. Gradual rollout: 10% → 50% → 100%
4. Monitor errors/performance
5. Decommission server-v2.js after 2 weeks

### Option 2: In-Place Migration

1. Create database migration script
2. Deploy fresh-stack v2.0 to same Render service (replace server-v2.js)
3. Update plugin simultaneously
4. Monitor for errors

**Recommended:** Option 1 (parallel deployment) for safety.

---

## Success Metrics

After implementation, we should see:

- ✅ **Plugin team satisfied** - No more field name confusion
- ✅ **Faster responses** - <100ms for quota checks (using `quota_summaries`)
- ✅ **Accurate tracking** - Per-user, per-site usage visible in dashboard
- ✅ **Agency support** - Multiple sites with per-site quotas working
- ✅ **Clean codebase** - All files <300 lines, no duplication
- ✅ **Test coverage** - >80% unit test coverage
- ✅ **Scalable** - Handle 10,000+ requests/day without issues
- ✅ **Easy to extend** - Add new features without rewriting core

---

## Next Steps

**Option A:** Start with Phase 1 (Database Setup)
- I'll create the Supabase migration SQL file
- You review and apply it to your Supabase instance

**Option B:** Start with Phase 2 (Core Services)
- I'll implement `services/license.js` with TDD
- Write tests first, then implementation

**Option C:** Full implementation sprint
- I implement all phases sequentially
- You review each phase before moving to next

**Which approach would you prefer?** Or would you like to discuss the design first before implementation?
