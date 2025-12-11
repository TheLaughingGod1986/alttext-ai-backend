# Migration Guide: server-v2.js → fresh-stack

Complete guide for migrating from the complex server-v2.js architecture to the streamlined fresh-stack implementation.

## Table of Contents
1. [Why Migrate?](#why-migrate)
2. [Architecture Comparison](#architecture-comparison)
3. [Authentication Changes](#authentication-changes)
4. [Database Schema](#database-schema)
5. [Environment Variables](#environment-variables)
6. [API Endpoints](#api-endpoints)
7. [Step-by-Step Migration](#step-by-step-migration)
8. [Testing](#testing)
9. [Rollback Plan](#rollback-plan)

---

## Why Migrate?

### Problems with server-v2.js
- **Complex organization/JWT system** - Multiple auth layers, JWT signing, organization membership
- **Missing database tables** - Requires `organizations` and `organization_members` tables that don't exist in production
- **Tightly coupled** - Routes are defined inline, hard to test independently
- **No graceful degradation** - Fails hard when Supabase/Redis unavailable

### Benefits of fresh-stack
- **Simple license key auth** - Just lookup license_key in licenses table
- **Modular architecture** - Factory pattern for routes, clean separation of concerns
- **Graceful degradation** - Works without Supabase, Redis, or even OpenAI API
- **Better optimization** - WCAG 2.1 AA compliance, SEO-optimized prompts, gray zone detection
- **Cleaner codebase** - ~500 lines vs 1,200+ lines, easier to maintain

---

## Architecture Comparison

### server-v2.js Structure
```
server-v2.js (1,200+ lines)
├── Inline route definitions
├── JWT + organization auth
├── Complex middleware stack
├── No module separation
└── Requires all services (Supabase, Redis, Stripe)
```

### fresh-stack Structure
```
fresh-stack/
├── server.js (500 lines) - Main app
├── lib/
│   ├── auth.js - License key auth + quota
│   ├── openai.js - WCAG/SEO-optimized prompts
│   ├── validation.js - Gray zone + 512px checks
│   ├── redis.js - Optional Redis client
│   └── usage.js - Usage tracking
├── routes/
│   ├── billing.js - Stripe checkout/portal
│   └── usage.js - Usage reporting
├── frontend/ - Static demo UI
└── README.md
```

---

## Authentication Changes

### server-v2.js Authentication
```javascript
// Complex dual-auth with priority: JWT > License
1. Try JWT token from Authorization: Bearer <token>
   - Decode JWT, validate signature
   - Check user exists in users table
   - Check user belongs to organization
   - Check organization is active

2. Try license key from X-License-Key
   - Lookup in licenses table
   - Check status === 'active'
   - Attach license to request
```

### fresh-stack Authentication
```javascript
// Simple license-first auth
1. Try license key from X-License-Key
   - Lookup in licenses table
   - Check status === 'active'
   - Attach license to request
   - Set req.authMethod = 'license'

2. Fallback to X-API-Key / Bearer token
   - Simple string match against ALT_API_TOKEN env var
   - No JWT, no database lookup

3. Allow unauthenticated requests (free tier)
   - No auth header required
   - Uses X-Site-Key for quota tracking
   - Default 50 images/month quota
```

**Migration Impact:**
- **WordPress plugin**: Update to send `X-License-Key` instead of `Authorization: Bearer <jwt>`
- **API consumers**: Can use either `X-License-Key` (best) or `X-API-Key` (simple) or no auth (free tier)
- **No breaking changes**: Both license keys and API tokens still work

---

## Database Schema

### Tables Required

#### fresh-stack (minimal schema)
```sql
-- Required tables
licenses (
  id, license_key, status, plan, created_at
)

sites (
  id, site_hash, license_key, plan, created_at
)

usage_logs (
  id, site_hash, images, images_used,
  prompt_tokens, completion_tokens, created_at
)

-- Optional (for Stripe billing)
subscriptions (
  id, site_hash, plan, status,
  current_period_start, current_period_end
)

credits (
  id, site_hash, monthly_limit, used_this_month
)
```

#### server-v2.js (complex schema)
```sql
-- All of fresh-stack tables PLUS:
organizations (
  id, name, owner_id, created_at
)

organization_members (
  id, organization_id, user_id, role, created_at
)

users (
  id, email, password_hash, created_at
)

-- Plus JWT signing keys, sessions, etc.
```

**Migration Impact:**
- ✅ **No new tables required** - fresh-stack uses existing `licenses`, `sites`, `usage_logs`
- ✅ **Simpler schema** - No organizations/users/JWT complexity
- ✅ **Can run in parallel** - fresh-stack and server-v2 can share the same database

---

## Environment Variables

### Comparison Table

| Variable | server-v2.js | fresh-stack | Notes |
|----------|--------------|-------------|-------|
| `ALTTEXT_OPENAI_API_KEY` | Required | Optional | Falls back to deterministic alt text |
| `OPENAI_API_KEY` | Fallback | Fallback | Same fallback behavior |
| `SUPABASE_URL` | Required | Optional | Gracefully degrades without it |
| `SUPABASE_KEY` | Required | Optional | Returns minimal data if missing |
| `REDIS_URL` | Optional | Optional | Uses in-memory cache if missing |
| `ALT_API_TOKEN` | For token auth | For token auth | Simple API key validation |
| `API_TOKEN` | Fallback | Fallback | Same fallback |
| `STRIPE_SECRET_KEY` | For billing | For billing | Required for `/billing/*` routes |
| `STRIPE_WEBHOOK_SECRET` | For webhooks | ❌ Not used | Webhooks handled separately |
| `JWT_SECRET` | Required | ❌ Not needed | No JWT in fresh-stack |
| `ALLOWED_ORIGINS` | CORS | CORS | Same behavior |
| `RATE_LIMIT_PER_SITE` | 60/min | 120/min | Higher default in fresh-stack |
| `RATE_LIMIT_GLOBAL` | 0 (disabled) | 0 (disabled) | Same |
| `PORT` | 3000 | 4000 | Different defaults to avoid conflicts |
| `HOST` | 0.0.0.0 | 127.0.0.1 | fresh-stack binds to localhost by default |

### Minimal .env for fresh-stack
```bash
# Bare minimum (works without any of these!)
# No env vars required for basic operation

# Recommended for production
ALTTEXT_OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...
ALT_API_TOKEN=your-secret-token

# Optional for billing
STRIPE_SECRET_KEY=sk_live_...
ALTTEXT_AI_STRIPE_PRICE_PRO=price_...
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_...
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_...

# Optional for caching/rate limiting
REDIS_URL=redis://...

# Optional CORS
ALLOWED_ORIGINS=https://example.com,https://app.example.com
```

---

## API Endpoints

### Endpoint Compatibility Matrix

| Endpoint | server-v2.js | fresh-stack | Compatible? |
|----------|--------------|-------------|-------------|
| `POST /api/alt-text` | ✅ | ✅ | ✅ Fully compatible |
| `POST /api/jobs` | ✅ | ✅ | ✅ Fully compatible |
| `GET /api/jobs/:jobId` | ✅ | ✅ | ✅ Fully compatible |
| `GET /api/usage` | ✅ | ✅ | ⚠️ Response format slightly different |
| `GET /billing/plans` | ✅ | ✅ | ✅ Fully compatible |
| `POST /billing/checkout` | ✅ | ✅ | ✅ Fully compatible |
| `POST /billing/portal` | ✅ | ✅ | ✅ Fully compatible |
| `GET /billing/subscription` | ✅ | ✅ | ✅ Fully compatible |
| `POST /auth/register` | ✅ | ❌ | No user registration |
| `POST /auth/login` | ✅ | ❌ | No JWT auth |
| `GET /organizations/*` | ✅ | ❌ | No organization routes |

### Request/Response Changes

#### POST /api/alt-text

**Request** (identical):
```json
{
  "image": {
    "base64": "iVBORw0K...",
    "width": 512,
    "height": 341,
    "mime_type": "image/jpeg",
    "filename": "hero-banner.jpg"
  },
  "context": {
    "title": "Hero Banner",
    "pageTitle": "Home - Example.com"
  }
}
```

**Response** (enhanced in fresh-stack):
```json
{
  "altText": "Professional team collaborating on laptop in modern office",
  "warnings": [
    "Image is 600x400 (max 600px). Resize to 512px max for 50% token savings."
  ],
  "usage": {
    "prompt_tokens": 234,
    "completion_tokens": 18,
    "total_tokens": 252
  },
  "meta": {
    "modelUsed": "gpt-4o-mini",
    "cached": false
  }
}
```

**New in fresh-stack:**
- ✨ 512px dimension warnings
- ✨ Gray zone detection errors (prevents high token costs)
- ✨ WCAG 2.1 Level AA optimized alt text (10-15 words, 125 char max)
- ✨ Keyword extraction from filename

#### GET /api/usage

**Headers** (same):
```
X-Site-Key: your-site-hash
X-API-Key: your-api-token
```

**Response differences:**

server-v2.js:
```json
{
  "success": true,
  "siteId": "abc123",
  "subscription": {
    "plan": "pro",
    "quota": 1000,
    "used": 234,
    "remaining": 766
  },
  "organization": {
    "id": "org_123",
    "name": "Acme Corp"
  }
}
```

fresh-stack (no organization):
```json
{
  "success": true,
  "siteId": "abc123",
  "subscription": {
    "plan": "pro",
    "status": "active",
    "quota": 1000,
    "used": 234,
    "remaining": 766,
    "periodStart": "2025-12-01T00:00:00.000Z",
    "periodEnd": "2026-01-01T00:00:00.000Z",
    "scope": "site"
  },
  "credits": {
    "total": 0,
    "used": 0,
    "remaining": 0,
    "scope": "site"
  },
  "users": []
}
```

---

## Step-by-Step Migration

### Phase 1: Preparation (No downtime)

1. **Verify database tables exist**
   ```sql
   -- Check if required tables exist
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('licenses', 'sites', 'usage_logs');
   ```

2. **Create test license keys** (if needed)
   ```sql
   INSERT INTO licenses (license_key, status, plan, created_at)
   VALUES ('test-license-123', 'active', 'pro', NOW());
   ```

3. **Set up environment variables**
   ```bash
   # Copy from server-v2 .env and remove JWT_SECRET
   cp .env fresh-stack/.env.local
   # Edit fresh-stack/.env.local and remove JWT_SECRET
   ```

4. **Test fresh-stack locally**
   ```bash
   cd fresh-stack
   PORT=4001 node server.js  # Different port to avoid conflict
   ```

5. **Run test suite**
   ```bash
   node fresh-stack/test-fresh.js
   ```

### Phase 2: Parallel Deployment (Zero downtime)

1. **Deploy fresh-stack to new service** (e.g., Render)
   - Create new web service: `alttext-fresh`
   - Set environment variables
   - Deploy from `fresh-stack/` directory
   - URL: `https://alttext-fresh.onrender.com`

2. **Keep server-v2 running**
   - No changes to existing service
   - Current users unaffected
   - URL: `https://alttext-api.onrender.com`

3. **Test fresh-stack in production**
   ```bash
   curl -X POST https://alttext-fresh.onrender.com/api/alt-text \
     -H "Content-Type: application/json" \
     -H "X-License-Key: test-license-123" \
     -H "X-Site-Key: test-site" \
     -d '{
       "image": {
         "url": "https://example.com/test.jpg"
       }
     }'
   ```

### Phase 3: Plugin Migration (Gradual rollout)

1. **Update WordPress plugin** to support both endpoints
   ```php
   // Add setting for API endpoint
   $endpoint = get_option('alttext_api_endpoint', 'v2'); // 'v2' or 'fresh'

   if ($endpoint === 'fresh') {
       $url = 'https://alttext-fresh.onrender.com/api/alt-text';
       $headers = [
           'X-License-Key' => $license_key,
           'X-Site-Key' => $site_hash
       ];
   } else {
       $url = 'https://alttext-api.onrender.com/api/alt-text';
       $headers = [
           'Authorization' => 'Bearer ' . $jwt_token,
           'X-Site-Hash' => $site_hash
       ];
   }
   ```

2. **Beta test with select users**
   - Enable `alttext_api_endpoint=fresh` for 5-10 beta testers
   - Monitor logs for errors
   - Collect feedback

3. **Gradual rollout**
   - Week 1: 10% of users → fresh-stack
   - Week 2: 25% of users → fresh-stack
   - Week 3: 50% of users → fresh-stack
   - Week 4: 100% of users → fresh-stack

### Phase 4: Cutover (Planned downtime optional)

1. **Update DNS/load balancer**
   ```
   Before: api.alttext.com → server-v2.js
   After:  api.alttext.com → fresh-stack
   ```

2. **Update documentation**
   - API docs point to fresh-stack
   - Update code examples
   - Mark organization endpoints as deprecated

3. **Decommission server-v2.js**
   - Wait 2 weeks after 100% migration
   - Archive server-v2.js code
   - Delete Render service

---

## Testing

### Manual Testing Checklist

- [ ] **Authentication**
  - [ ] Valid license key returns 200
  - [ ] Invalid license key returns 401
  - [ ] No auth header uses free tier (50 images/month)
  - [ ] API token auth works

- [ ] **Alt Text Generation**
  - [ ] Returns alt text for base64 image
  - [ ] Returns alt text for URL image
  - [ ] Alt text is 10-15 words, <125 chars
  - [ ] Keywords from context included

- [ ] **Validation**
  - [ ] 512px warning for 600×400 image
  - [ ] Gray zone error for suspiciously small base64
  - [ ] Invalid base64 returns 400

- [ ] **Quota Enforcement**
  - [ ] Returns 402 when quota exceeded
  - [ ] Batch endpoint checks total batch size against quota
  - [ ] Usage tracked in usage_logs table

- [ ] **Billing**
  - [ ] `/billing/plans` returns plans
  - [ ] `/billing/checkout` creates Stripe session
  - [ ] `/billing/portal` returns portal URL

- [ ] **Graceful Degradation**
  - [ ] Works without Redis (in-memory cache)
  - [ ] Works without Supabase (returns defaults)
  - [ ] Works without OpenAI API (deterministic fallback)

### Automated Testing

```bash
# Run test suite
node fresh-stack/test-fresh.js

# Expected output:
# ✅ 512px warning present
# ✅ Word count optimal (10-15)
# ✅ Character count optimal (≤125)
# ✅ Quota check passed
# ✅ Gray zone detection working
# ✅ License key validation working
```

### Load Testing

```bash
# Install artillery
npm install -g artillery

# Create artillery config
cat > fresh-stack-load-test.yml <<EOF
config:
  target: "http://localhost:4000"
  phases:
    - duration: 60
      arrivalRate: 10  # 10 requests/sec
scenarios:
  - name: "Alt text generation"
    flow:
      - post:
          url: "/api/alt-text"
          headers:
            X-Site-Key: "load-test"
            Content-Type: "application/json"
          json:
            image:
              url: "https://picsum.photos/512/341"
EOF

# Run load test
artillery run fresh-stack-load-test.yml
```

---

## Rollback Plan

### Immediate Rollback (< 5 minutes)

If fresh-stack fails in production:

1. **Update DNS/load balancer**
   ```
   Change: api.alttext.com → server-v2.js
   ```

2. **No data loss**
   - Both systems write to same database tables
   - No migrations were run
   - All data preserved

3. **Plugin rollback** (if needed)
   ```php
   update_option('alttext_api_endpoint', 'v2'); // Revert to server-v2
   ```

### Partial Rollback

If specific features fail:

1. **Disable license key auth**
   ```bash
   # In fresh-stack, remove license middleware
   # Fallback to API token only
   ```

2. **Disable quota checking**
   ```javascript
   // Comment out quota check in server.js:333-344
   ```

3. **Disable gray zone detection**
   ```javascript
   // Comment out gray zone check in validation.js:52-63
   ```

---

## Troubleshooting

### Common Issues

#### 1. "Cannot find module 'ioredis'"
**Solution:** Run `npm install` from root directory
```bash
cd /path/to/alttext-ai-backend
npm install
```

#### 2. "TypeError: app.use() requires a middleware function"
**Cause:** validateLicenseKey declared as `async function` instead of regular function
**Solution:** Already fixed in lib/auth.js:10

#### 3. High token usage (3,000+ tokens)
**Cause:** Gray zone detection not triggering
**Solution:** Ensure validation.js has 50K pixel threshold and 5× multiplier

#### 4. "QUOTA_EXCEEDED" but user has remaining quota
**Cause:** Quota calculation using wrong billing period
**Check:**
```sql
SELECT * FROM usage_logs
WHERE site_hash = 'xxx'
AND created_at >= DATE_TRUNC('month', NOW());
```

#### 5. License key not being validated
**Cause:** Supabase not configured
**Solution:** Check `SUPABASE_URL` and `SUPABASE_KEY` env vars

---

## FAQ

### Q: Can I run both server-v2 and fresh-stack at the same time?
**A:** Yes! They share the same database and can run in parallel. Use different ports (3000 vs 4000) and different URLs.

### Q: Will existing license keys work with fresh-stack?
**A:** Yes! fresh-stack uses the same `licenses` table. No migration needed.

### Q: Do I need to migrate the database schema?
**A:** No! fresh-stack uses the existing tables. It actually needs *fewer* tables than server-v2 (no organizations/users).

### Q: What happens to JWT tokens?
**A:** JWT auth is removed in fresh-stack. Use license keys instead (`X-License-Key` header).

### Q: Will this break the WordPress plugin?
**A:** No if you update the plugin to send `X-License-Key` instead of `Authorization: Bearer`. You can support both endpoints during migration.

### Q: Can users still use free tier?
**A:** Yes! No auth header required. Just send `X-Site-Key` and you get 50 images/month.

### Q: What if Supabase is down?
**A:** fresh-stack gracefully degrades - returns default quotas, skips license validation, uses in-memory cache.

### Q: Are the WCAG/SEO optimizations backward compatible?
**A:** Yes! The prompts are better, but the API interface is unchanged. Existing integrations will automatically get better alt text.

---

## Summary

### Key Migration Steps
1. ✅ Deploy fresh-stack to new service (parallel to server-v2)
2. ✅ Update WordPress plugin to support both endpoints
3. ✅ Beta test with 10% of users
4. ✅ Gradual rollout over 4 weeks
5. ✅ Cutover DNS once 100% migrated
6. ✅ Decommission server-v2 after 2 weeks

### Risk Mitigation
- Zero-downtime parallel deployment
- Instant rollback capability (just change DNS)
- No database migrations required
- Backward compatible API
- Comprehensive test suite

### Timeline
- **Week 1**: Deploy fresh-stack, beta test
- **Weeks 2-5**: Gradual rollout (10% → 25% → 50% → 100%)
- **Week 6**: Cutover DNS
- **Week 8**: Decommission server-v2

---

**Questions?** Open an issue or contact the team.
